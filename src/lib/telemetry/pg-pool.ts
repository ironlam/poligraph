import { AsyncLocalStorage } from "node:async_hooks";
import { Client, Pool, type PoolConfig } from "pg";
import { captureDriverRead, recordUnsupportedDriverRead } from "./read-operations";
import {
  classifyAcquisition,
  describeAcquisition,
  isSlowAcquisition,
  startLoopLagProbe,
  type AcquisitionSample,
} from "./pool-acquisition";
import { POOLER_REFUSAL_RETRY_DELAYS_MS } from "@/config/database";
import { createReportGate, isPoolerRefusal } from "./pool-exhaustion";

/** How often one process may send a slow acquisition to Sentry. */
export const SLOW_ACQUISITION_REPORT_INTERVAL_MS = 10 * 60_000;

const slowAcquisitionGate = createReportGate(SLOW_ACQUISITION_REPORT_INTERVAL_MS);

type Invocation = (...args: unknown[]) => unknown;

/** Pool's documented Client constructor seam, installed once, without changing pg prototypes. */
class ObservedClient extends Client {
  override query: Client["query"] = ((...args: unknown[]) => {
    // Cursors/Submittable objects have a different result contract; they are outside this scope.
    if (args[0] && typeof args[0] === "object" && "submit" in args[0]) {
      recordUnsupportedDriverRead();
      return (super.query as Invocation)(...args);
    }
    const record = captureDriverRead();
    if (!record) return (super.query as Invocation)(...args);
    const callback = args.at(-1);
    if (typeof callback === "function") {
      args[args.length - 1] = function (this: unknown, error: unknown, result: unknown) {
        record(error, result);
        return callback.call(this, error, result);
      };
      try {
        return (super.query as Invocation)(...args);
      } catch (error) {
        record(error, undefined);
        throw error;
      }
    }
    try {
      return Promise.resolve((super.query as Invocation)(...args)).then(
        (result) => {
          record(null, result);
          return result;
        },
        (error: unknown) => {
          record(error, undefined);
          throw error;
        }
      );
    } catch (error) {
      record(error, undefined);
      throw error;
    }
  }) as Client["query"];
}

export class ObservedPool extends Pool {
  constructor(
    config: PoolConfig,
    private readonly refusalRetryDelaysMs: readonly number[] = POOLER_REFUSAL_RETRY_DELAYS_MS
  ) {
    super({ ...config, Client: ObservedClient });
  }

  // A refusal by the pooler is transient (see POOLER_REFUSAL_RETRY_DELAYS_MS): ask again a few
  // times before letting the error reach the caller. Nothing has been sent on a refused
  // connection, so trying again cannot run a statement twice.
  override connect: Pool["connect"] = ((...args: unknown[]) => {
    const callback = args[0];
    const startedAt = Date.now();

    if (typeof callback === "function") {
      const invoke = callback as Invocation;
      const attempt = (retries: number): unknown =>
        (this.acquire as Invocation)((...callbackArgs: unknown[]) => {
          const wait = this.refusalRetryWait(callbackArgs[0], retries, startedAt);
          if (wait === null) return invoke(...callbackArgs);
          setTimeout(() => {
            // Closed while waiting: hand back the refusal rather than an error about the closing.
            if (this.ending) invoke(...callbackArgs);
            else attempt(retries + 1);
          }, wait);
        });
      return attempt(0);
    }

    const attempt = (retries: number): Promise<unknown> =>
      ((this.acquire as Invocation)() as Promise<unknown>).catch(async (error: unknown) => {
        const wait = this.refusalRetryWait(error, retries, startedAt);
        if (wait === null) throw error;
        await new Promise((resolve) => setTimeout(resolve, wait));
        if (this.ending) throw error;
        return attempt(retries + 1);
      });
    return attempt(0);
  }) as Pool["connect"];

  /**
   * The wait before the next attempt, or null when the error should reach the caller as it is.
   *
   * `connectionTimeoutMillis` restarts with every attempt, so the retries get a budget of their
   * own: no new attempt starts once the time spent since the first one, wait included, reaches
   * that timeout. The call as a whole therefore lasts at most twice the timeout, not once per
   * attempt.
   */
  private refusalRetryWait(error: unknown, retries: number, startedAt: number): number | null {
    const delay = this.refusalRetryDelaysMs[retries];
    if (delay === undefined || this.ending || !isPoolerRefusal(error)) return null;

    const wait = Math.round(delay * (0.5 + Math.random() / 2));
    const budget = this.options.connectionTimeoutMillis;
    if (budget && Date.now() - startedAt + wait >= budget) return null;

    // eslint-disable-next-line no-console -- deliberate ops signal (Vercel logs, Sentry breadcrumb)
    console.warn(
      `[pg-pool] refus du pooler, nouvelle tentative ${retries + 1}/${this.refusalRetryDelaysMs.length} dans ${wait}ms`
    );
    return wait;
  }

  // Pool.query acquires through this public callback API. A queued acquisition otherwise runs
  // under the releasing operation's context. Bind even the empty/unsampled context to prevent leaks.
  //
  // The timing wrapper goes inside the binding, not around it, so the whole call still runs in the
  // caller's context rather than the releasing operation's.
  private acquire: Pool["connect"] = ((...args: unknown[]) => {
    const startedAt = Date.now();
    // Read before the acquisition, because that is what decides which pg-pool branch runs: a full
    // pool queues the caller, a pool with room opens a new connection.
    const poolMax = this.options.max ?? 10;
    const atCapacity = this.totalCount;
    // One probe per acquisition, so the lag reported alongside a wait is the lag during that wait.
    const lag = startLoopLagProbe();
    const callback = args[0];

    if (typeof callback === "function") {
      const invoke = callback as Invocation;
      const measured = function (this: unknown, ...callbackArgs: unknown[]) {
        reportSlowAcquisition(Date.now() - startedAt, lag.stop(), atCapacity, poolMax);
        return invoke.apply(this, callbackArgs);
      };
      args[0] = AsyncLocalStorage.bind(measured);
      return (super.connect as Invocation)(...args);
    }

    const acquisition = (super.connect as Invocation)(...args) as Promise<unknown>;
    return acquisition.then(
      (client) => {
        reportSlowAcquisition(Date.now() - startedAt, lag.stop(), atCapacity, poolMax);
        return client;
      },
      (error: unknown) => {
        reportSlowAcquisition(Date.now() - startedAt, lag.stop(), atCapacity, poolMax);
        throw error;
      }
    );
  }) as Pool["connect"];
}

/** Exported so the threshold and the reported line can be asserted without a database. */
export function reportSlowAcquisition(
  waitedMs: number,
  loopLagMs: number,
  poolTotal: number,
  poolMax: number
): void {
  if (!isSlowAcquisition(waitedMs)) return;

  const sample: AcquisitionSample = { waitedMs, loopLagMs, poolTotal, poolMax };

  const detail = describeAcquisition(sample);
  // eslint-disable-next-line no-console -- deliberate ops signal (Vercel logs, Sentry breadcrumb)
  console.warn(`[pg-pool] ${detail}`);

  // Only inside a Next runtime. This module is imported by batch scripts and by the unit suite,
  // where Sentry is neither initialised nor wanted, and where an import still resolving after the
  // caller has finished is work nobody awaits. The console line above is the signal there.
  if (!process.env.NEXT_RUNTIME) return;

  // Once per process per window. Unthrottled, this warning was the largest consumer of the error
  // quota (POLIGRAPH-2X, 1243 events in a month), which ran out on 2026-09-28 and left the
  // 2026-10-01 outage unreported. Every slow acquisition still reaches the console line above.
  if (!slowAcquisitionGate()) return;

  void import("@sentry/nextjs")
    .then((Sentry) => {
      Sentry.captureMessage(`Acquisition de connexion lente : ${detail}`, {
        level: "warning",
        tags: { poolAcquisition: classifyAcquisition(sample) },
      });
    })
    .catch(() => {});
}
