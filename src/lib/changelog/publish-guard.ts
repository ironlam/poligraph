/**
 * Every public claim links to its source. A changelog entry follows the same rule, so an entry
 * without a source cannot leave DRAFT.
 */
export function isChangelogPublishable(entry: { sourceUrl: string | null | undefined }): boolean {
  return Boolean(entry.sourceUrl && entry.sourceUrl.trim().length > 0);
}
