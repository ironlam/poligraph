/**
 * Feature flags: static, typed, deployed via Vercel (~1 min redeploy).
 *
 * To toggle a feature: change the value, push, done.
 *
 * The featured election is NOT here. It is `Election.featured`, read by `getFeaturedElection()`.
 * `ELECTION_BANNER` and `FEATURED_ELECTION_SLUG` used to live here, were read by nothing, and were
 * removed on 2026-08-07 along with the corresponding paragraph of the hub spec (§6.3).
 */

export const FEATURES = {
  /** Show practical guide section on election detail pages */
  ELECTION_GUIDE_SECTION: true,
} as const;

export function isFeatureEnabled(key: keyof typeof FEATURES): boolean {
  return !!FEATURES[key];
}
