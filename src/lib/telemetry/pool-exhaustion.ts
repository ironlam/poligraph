/**
 * Supavisor refusing a new client because its 400 client connections are taken.
 *
 * On 2026-10-01 this error fired 573 times in five minutes over forty-five routes, and Sentry showed
 * nothing. The errors did leave the process: Sentry rejected them because the monthly error quota was
 * spent, and one burst of this kind alone would spend a tenth of it. Two things follow. The incident
 * must land in one issue whatever the route, so that its first event is a new issue and alerts. And
 * each process must send few of them, so that the next incident still finds quota to report it.
 */

/** Supavisor's code for the client ceiling, carried in the message of the driver error and its cause. */
const POOL_EXHAUSTED_CODE = "EMAXCONN";

export const POOL_EXHAUSTED_FINGERPRINT = ["db-pool-exhausted"];

/**
 * One event per process per window. A burst scales out to many instances, so the incident still
 * reports once per instance, which is the signal; the hundreds of renders failing on each are not.
 */
export const POOL_EXHAUSTED_REPORT_INTERVAL_MS = 10 * 60_000;

export function isPoolExhaustedError(error: unknown): boolean {
  let current: unknown = error;
  // The driver adapter wraps the pg error in `cause`; walk a short chain rather than trusting depth.
  for (let depth = 0; depth < 3 && current; depth++) {
    const message = (current as { message?: unknown }).message;
    if (typeof message === "string" && message.includes(POOL_EXHAUSTED_CODE)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** Opens at most once per interval. `now` is injectable so the window is testable without waiting. */
export function createReportGate(intervalMs: number, now: () => number = Date.now) {
  let lastOpenedAt = Number.NEGATIVE_INFINITY;
  return (): boolean => {
    const t = now();
    if (t - lastOpenedAt < intervalMs) return false;
    lastOpenedAt = t;
    return true;
  };
}

type SentryErrorEvent = {
  fingerprint?: string[];
  tags?: Record<string, unknown>;
};

/**
 * For Sentry's `beforeSend`: groups pool exhaustion into one issue and drops the repeats.
 * Any other event passes through untouched.
 */
export function createPoolExhaustionFilter(
  gate = createReportGate(POOL_EXHAUSTED_REPORT_INTERVAL_MS)
) {
  return <E extends SentryErrorEvent>(
    event: E,
    hint: { originalException?: unknown }
  ): E | null => {
    if (!isPoolExhaustedError(hint.originalException)) return event;
    if (!gate()) return null;
    event.fingerprint = POOL_EXHAUSTED_FINGERPRINT;
    event.tags = { ...event.tags, dbPool: "exhausted" };
    return event;
  };
}
