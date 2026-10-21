/**
 * Degraded-mode policy for the rate-limit middleware (Lot 3A).
 *
 * When Upstash is not configured the middleware cannot rate limit. This module
 * holds the pure decision logic so the behaviour is explicit and unit-tested:
 *
 * - development / preview: allow through, light throttled log, no fail-closed;
 * - production: allow through (so an Upstash outage never blocks the whole site
 *   nor locks operators out of admin), but emit a throttled alert and fail the
 *   `export` tier closed. `export` is the one heavy abuse / scraping vector with
 *   no operator dependency, so blocking it during an outage is safe and bounded.
 */

export type RateLimitMode = "enforced" | "degraded-dev" | "degraded-prod";

export type DegradedAction = "allow" | "block";

/**
 * Tiers that fail closed (HTTP 503) when rate limiting is degraded in
 * production. Deliberately limited to `export` and `feedback`: blocking admin
 * would lock operators out during an outage, and blocking search/general would
 * break the public site. `feedback` is an anonymous write endpoint: a form that
 * is unavailable for a few minutes costs less than an unthrottled flood of
 * rows.
 */
const FAIL_CLOSED_TIERS: ReadonlySet<string> = new Set(["export", "feedback"]);

/**
 * Vercel marks preview builds with `NODE_ENV=production`, so `VERCEL_ENV` is the
 * reliable production discriminator; fall back to `NODE_ENV` only off-platform.
 */
export function isProductionRuntime(env: { VERCEL_ENV?: string; NODE_ENV?: string }): boolean {
  if (env.VERCEL_ENV) return env.VERCEL_ENV === "production";
  return env.NODE_ENV === "production";
}

export function resolveRateLimitMode(hasLimiter: boolean, isProduction: boolean): RateLimitMode {
  if (hasLimiter) return "enforced";
  return isProduction ? "degraded-prod" : "degraded-dev";
}

export function degradedActionForTier(mode: RateLimitMode, tier: string): DegradedAction {
  if (mode === "degraded-prod" && FAIL_CLOSED_TIERS.has(tier)) return "block";
  return "allow";
}

/**
 * Whether to emit the degraded-mode alert now. Throttled so the signal fires at
 * most once per window instead of once per request.
 */
export function shouldEmitDegradedAlert(
  lastAlertAt: number | null,
  now: number,
  throttleMs: number
): boolean {
  return lastAlertAt === null || now - lastAlertAt >= throttleMs;
}
