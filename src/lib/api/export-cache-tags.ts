/**
 * Cache tags carried by the CSV export responses, and purged by `invalidateEntity`
 * when the matching entity is written. Both sides import from here: a tag posted on
 * one side and spelled differently on the other purges nothing, silently.
 *
 * Vercel forbids commas inside a tag (it is the header separator).
 */
export const EXPORT_CACHE_TAGS = {
  affairs: "export:affairs",
  politicians: "export:politicians",
  factchecks: "export:factchecks",
  votes: "export:votes",
} as const;

/** Roll-up tag, to purge every export at once (full sync, manual dashboard purge). */
export const EXPORT_ROLLUP_TAG = "exports";

export type ExportCacheKey = keyof typeof EXPORT_CACHE_TAGS;
