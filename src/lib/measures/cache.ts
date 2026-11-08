import { revalidateTags } from "@/lib/cache";

/**
 * Cache invalidation is NOT part of the publication transaction: revalidateTag() is a
 * call to the hosting platform, not SQL, and describing it as atomic with PostgreSQL
 * would be wrong.
 *
 * Best effort with a log, and NO retry. A retry held in memory does not survive the end
 * of the lambda, so it would buy the appearance of a guarantee and nothing else. A lost
 * invalidation leaves the page stale until its cacheLife profile expires, which is a
 * known and bounded defect. An outbox table is what fixes it properly, and it belongs to
 * no lot yet.
 *
 * Throwing here would be worse than logging: the transaction is already committed, so the
 * caller would believe the publication failed when it succeeded.
 */
export function invalidateMeasureTags(
  measureId: string,
  electionId: string,
  {
    visibilityReduced = false,
    candidacyId = null,
  }: {
    visibilityReduced?: boolean;
    candidacyId?: string | null;
  } = {}
): void {
  try {
    const tags = [`measure:${measureId}`, `election-measures:${electionId}`];
    if (visibilityReduced && candidacyId) {
      // Other fiches can display this candidacy's measures as related suggestions.
      tags.push(`candidacy-measure-visibility:${candidacyId}`);
    }
    revalidateTags(tags, visibilityReduced ? { expire: 0 } : undefined);
  } catch (error) {
    // The only trace of a lost invalidation, which leaves a page stale until its
    // cacheLife profile expires.
    // eslint-disable-next-line no-console -- deliberate ops signal
    console.error("[measures] cache invalidation failed for", measureId, error);
  }
}
