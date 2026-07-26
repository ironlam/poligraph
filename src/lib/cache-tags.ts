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

/** Every tag an operator may name explicitly (admin endpoint, cron endpoint). */
export const SELECTABLE_TAGS = [...ALL_TAGS, ...FROZEN_TAGS] as const;

export type CacheTag = (typeof ALL_TAGS)[number];
export type FrozenCacheTag = (typeof FROZEN_TAGS)[number];
export type SelectableCacheTag = (typeof SELECTABLE_TAGS)[number];
