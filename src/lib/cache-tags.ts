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
export const NARROW_TAGS = ["votes-key", "homepage"] as const;

/** Every tag an operator may name explicitly (admin endpoint, cron endpoint). */
export const SELECTABLE_TAGS = [...ALL_TAGS, ...FROZEN_TAGS, ...NARROW_TAGS] as const;

export type CacheTag = (typeof ALL_TAGS)[number];
export type NarrowCacheTag = (typeof NARROW_TAGS)[number];
export type FrozenCacheTag = (typeof FROZEN_TAGS)[number];
export type SelectableCacheTag = (typeof SELECTABLE_TAGS)[number];
