/**
 * Reads a slow pool acquisition and says which side is at fault.
 *
 * POLIGRAPH-1R is a connection whose handshake did not finish within the acquisition budget, at a
 * rate of roughly eight per hour over eight hours, while the pool was never full. Two explanations
 * fit that shape and they call for opposite remedies: either the pooler stalls while authenticating
 * because its shared backends are busy, or this process's event loop was blocked so the connect
 * callback could not run and the timer killed a socket that was fine.
 *
 * Measuring the wait alone cannot separate them. Measuring the event loop's own lag over the same
 * window can: if the loop was blocked for about as long as the caller waited, the wait is ours.
 *
 * Pure on purpose, so the rule is testable without a database or a running event loop.
 */

/**
 * Reporting threshold. Below the acquisition budget in `@/config/database` so that near-misses are
 * visible before they turn into failures, and above what ordinary load produces (measured on
 * staging: 481 ms at eight concurrent renders, 1.1 s at sixteen, 2.3 s at thirty-two).
 */
export const SLOW_ACQUISITION_MS = 2_000;

/**
 * `monitorEventLoopDelay` never reports below its own resolution, so a small figure is the floor of
 * the instrument rather than a measured delay.
 */
const LOOP_LAG_FLOOR_MS = 100;

/** Above this share of the wait, the blocked loop is the wait. */
const LOOP_LAG_SHARE = 0.5;

export type AcquisitionSample = {
  waitedMs: number;
  loopLagMs: number;
  /** Connections the pool already held when the caller asked for one. */
  poolTotal: number;
  poolMax: number;
};

/**
 * Mirrors what pg-pool actually did, so the verdict names a branch rather than a suspicion:
 *
 * - `event-loop`  the wait is this process's own blocked loop, whichever branch was taken.
 * - `pool-queue`  the pool was at capacity, so the caller queued for a slot (pg-pool:216).
 * - `upstream`    the pool had room, so a fresh connection was being opened and the handshake
 *                 itself was slow (pg-pool:262). This is the POLIGRAPH-1R shape.
 * - `unclear`     the loop contributed without explaining the wait.
 */
export type AcquisitionCause = "event-loop" | "pool-queue" | "upstream" | "unclear";

export function isSlowAcquisition(
  waitedMs: number,
  thresholdMs: number = SLOW_ACQUISITION_MS
): boolean {
  return waitedMs > thresholdMs;
}

export function classifyAcquisition({
  waitedMs,
  loopLagMs,
  poolTotal,
  poolMax,
}: AcquisitionSample): AcquisitionCause {
  if (loopLagMs >= waitedMs * LOOP_LAG_SHARE) return "event-loop";
  if (loopLagMs > LOOP_LAG_FLOOR_MS) return "unclear";
  return poolTotal >= poolMax ? "pool-queue" : "upstream";
}

export function describeAcquisition(sample: AcquisitionSample): string {
  return (
    `acquisition ${sample.waitedMs}ms, retard boucle ${sample.loopLagMs}ms, ` +
    `pool ${sample.poolTotal}/${sample.poolMax} → ${classifyAcquisition(sample)}`
  );
}
