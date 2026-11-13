/**
 * The cache tag vocabulary, in one place.
 *
 * This module deliberately imports nothing. `@/lib/cache` pulls in `next/cache`
 * and is server-only; the request schemas in `@/lib/security/schemas` are reached
 * from validation code that must stay free of server internals. Both need the
 * same list, so the list lives here and neither owns it.
 *
 * Before this split, `ALL_TAGS` and the admin endpoint's allow-list were two
 * hand-copied arrays that had already drifted: "affairs" was missing from the
 * allow-list, so an operator could not purge affairs selectively (#572).
 */

/** Tags purged by a full post-sync revalidation. */
export const ALL_TAGS = [
  "politicians",
  "parties",
  "affairs",
  "votes",
  "stats",
  "dossiers",
  "factchecks",
  "elections",
] as const;

/**
 * Tags held out of `revalidateAll()`. The 2026 municipales results are frozen,
 * so a routine sync must never regenerate those pages. They stay individually
 * selectable by an operator who knows what they are doing.
 */
export const FROZEN_TAGS = ["elections-municipales-2026"] as const;

/**
 * Narrow sub-tags applied ALONGSIDE a broad tag on specific data functions
 * (e.g. `getKeyVotes` is tagged both "votes" and "votes-key"). Selectable so an
 * operator can refresh just that surface (the key-votes hub, the homepage)
 * without purging the whole "votes" tag, which spans the entire site and is
 * expensive to regenerate. Held out of `revalidateAll()`: a full purge already
 * covers them through their parent tag.
 */
// "territoires" spans the Territoires readers (src/lib/data/territoires.ts), which also carry
// "politicians" and "elections": a full purge reaches them through those.
// "historical-group-positions" is the dated group counts of the scrutin page
// (src/lib/data/historical-group-positions.ts). Selectable so that a revoked run can be taken off
// the pages at once, without the site-wide "votes" purge.
// "scrutin-analysis" is the debate analysis of the scrutin page (`getScrutinAnalysis`), its only
// reader. The daily sync regenerates a few analyses per run: purging "votes" for them restaled every
// profile, listing and comparison of the site, which is where most ISR writes came from.
// "politician-votes" is the vote record of one politician on the profile (counts per legislature,
// participation, parliamentary path). Those readers depend on votes and on deputy mandates only,
// so they carry "votes" and this tag INSTEAD of "politicians": the daily sync purges "politicians"
// three times a day for prominence and publication changes, which re-ran the heaviest queries of
// the profile for no change in what they read. Purged with a mandate or a politician edit
// (`invalidateEntity`); a full purge reaches them through "votes".
export const NARROW_TAGS = [
  "votes-key",
  "homepage",
  "gouvernements",
  "territoires",
  "historical-group-positions",
  "changelog",
  "scrutin-analysis",
  "politician-votes",
] as const;

export const POLITICIAN_VOTES_TAG = "politician-votes" satisfies (typeof NARROW_TAGS)[number];

/** Per-scrutin tag of the debate analysis, so one regenerated analysis restales one page. */
export function scrutinAnalysisTag(scrutinId: string): string {
  return `scrutin-analysis:${scrutinId}`;
}

/** Every tag an operator may name explicitly (admin endpoint, cron endpoint). */
export const SELECTABLE_TAGS = [...ALL_TAGS, ...FROZEN_TAGS, ...NARROW_TAGS] as const;

export type CacheTag = (typeof ALL_TAGS)[number];
export type NarrowCacheTag = (typeof NARROW_TAGS)[number];
export type FrozenCacheTag = (typeof FROZEN_TAGS)[number];
export type SelectableCacheTag = (typeof SELECTABLE_TAGS)[number];
