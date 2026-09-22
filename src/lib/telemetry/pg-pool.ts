import { AsyncLocalStorage } from "node:async_hooks";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { Client, Pool, type PoolConfig } from "pg";
import { captureDriverRead, recordUnsupportedDriverRead } from "./read-operations";
import {
  classifyAcquisition,
  describeAcquisition,
  isSlowAcquisition,
  type AcquisitionSample,
} from "./pool-acquisition";

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
  constructor(config: PoolConfig) {
    super({ ...config, Client: ObservedClient });
  }

  // Pool.query acquires through this public callback API. A queued acquisition otherwise runs
  // under the releasing operation's context. Bind even the empty/unsampled context to prevent leaks.
  //
  // The timing wrapper goes inside the binding, not around it, so the whole call still runs in the
  // caller's context rather than the releasing operation's.
  override connect: Pool["connect"] = ((...args: unknown[]) => {
    const startedAt = Date.now();
    // Read before the acquisition, because that is what decides which pg-pool branch runs: a full
    // pool queues the caller, a pool with room opens a new connection.
    const poolMax = this.options.max ?? 10;
    const atCapacity = this.totalCount;
    const callback = args[0];

    if (typeof callback === "function") {
      const invoke = callback as Invocation;
      const measured = function (this: unknown, ...callbackArgs: unknown[]) {
        reportSlowAcquisition(Date.now() - startedAt, atCapacity, poolMax);
        return invoke.apply(this, callbackArgs);
      };
      args[0] = AsyncLocalStorage.bind(measured);
      return (super.connect as Invocation)(...args);
    }

    const acquisition = (super.connect as Invocation)(...args) as Promise<unknown>;
    return acquisition.then(
      (client) => {
        reportSlowAcquisition(Date.now() - startedAt, atCapacity, poolMax);
        return client;
      },
      (error: unknown) => {
        reportSlowAcquisition(Date.now() - startedAt, atCapacity, poolMax);
        throw error;
      }
    );
  }) as Pool["connect"];
}

/**
 * Event loop lag, sampled continuously so a slow acquisition can be attributed. `max` covers the
 * window since the last report rather than the acquisition itself, which is the honest limit of a
 * process-wide histogram: a healthy figure proves the loop was never blocked over that window, a
 * high one only says it was blocked at some point in it.
 */
const loopDelay = monitorEventLoopDelay({ resolution: 20 });
loopDelay.enable();

/** Exported so the threshold and the reported line can be asserted without a database. */
export function reportSlowAcquisition(waitedMs: number, poolTotal: number, poolMax: number): void {
  if (!isSlowAcquisition(waitedMs)) return;

  const sample: AcquisitionSample = {
    waitedMs,
    loopLagMs: Math.round(loopDelay.max / 1e6),
    poolTotal,
    poolMax,
  };
  loopDelay.reset();

  const detail = describeAcquisition(sample);
  // eslint-disable-next-line no-console -- deliberate ops signal (Vercel logs, Sentry breadcrumb)
  console.warn(`[pg-pool] ${detail}`);

  // Only inside a Next runtime. This module is imported by batch scripts and by the unit suite,
  // where Sentry is neither initialised nor wanted, and where an import still resolving after the
  // caller has finished is work nobody awaits. The console line above is the signal there.
  if (!process.env.NEXT_RUNTIME) return;

  void import("@sentry/nextjs")
    .then((Sentry) => {
      Sentry.captureMessage(`Acquisition de connexion lente : ${detail}`, {
        level: "warning",
        tags: { poolAcquisition: classifyAcquisition(sample) },
      });
    })
    .catch(() => {});
}
