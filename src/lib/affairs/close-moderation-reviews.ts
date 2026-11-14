/**
 * Closing a moderation review when its affair gets decided.
 *
 * `ModerationReview.appliedAt` gates every moderation queue in the admin, and
 * before this module nothing ever wrote it: the three decision routes changed
 * `publicationStatus` and left the review pending forever. The queue therefore
 * grew by one row every time an editor made a decision, which is the opposite
 * of what a workload counter should do.
 *
 * One authority, called by every decision path. Three copies of this predicate
 * would drift, the way the three normalizers in `affair-matching` did.
 */
import { db } from "@/lib/db";

/**
 * Close every pending review attached to the given affairs.
 *
 * Scoped to `appliedAt: null` so a review already closed keeps its original
 * timestamp and author: re-deciding an affair must not rewrite who applied what.
 * Returns the number of rows actually closed, never the size of the input, so a
 * silently empty write cannot read as a success.
 */
export async function closeModerationReviews(
  affairIds: string[],
  appliedBy: string
): Promise<number> {
  if (affairIds.length === 0) return 0;

  const result = await db.moderationReview.updateMany({
    where: { affairId: { in: affairIds }, appliedAt: null },
    data: { appliedAt: new Date(), appliedBy },
  });

  return result.count;
}
