import type { DbTransactionClient } from "@/lib/db";
import { deleteSearchDocument, upsertSearchDocument } from "@/lib/search/documents";

const MAX_TITLE_LENGTH = 200;

/**
 * Derives the SearchDocument from the measure's pointers, inside the caller's transaction.
 *
 * ONE function for the whole visibility policy of spec 7.2, and that is the point. The
 * first version of this plan only indexed at publication and only flipped visibility at
 * depublication, which broke in three places:
 *
 *  - a measure created in draft had no document at all, while the policy says it must
 *    have one in ADMIN_ONLY;
 *  - a new draft on a never-published measure left the document on the old revision;
 *  - a depublication with a draft in flight left an ADMIN_ONLY document aligned on the
 *    former published revision, while the staleness rule for ADMIN_ONLY compares against
 *    latestRevisionId. The audit reported it stale, and it was right.
 *
 * Deriving instead of ordering each transition to do its own upsert means the policy has
 * a single implementation, and every transition just calls this at the end.
 */
export async function syncSearchDocument(
  tx: DbTransactionClient,
  measureId: string
): Promise<void> {
  const measure = await tx.measure.findUniqueOrThrow({
    where: { id: measureId },
    select: {
      publicationStatus: true,
      publishedRevisionId: true,
      publishedRevision: { select: { id: true, text: true, updatedAt: true } },
      latestRevision: { select: { id: true, text: true, updatedAt: true } },
    },
  });

  const isPublic =
    measure.publicationStatus === "PUBLISHED" && measure.publishedRevisionId !== null;
  const reference = isPublic ? measure.publishedRevision : measure.latestRevision;

  // Nothing left to represent: no published revision and no active draft. Happens when
  // the only draft of a never-published measure is discarded. Removing the row is the
  // coherent answer, and it is why the audit only demands a document for measures that
  // do have a reference revision.
  if (!reference) {
    await deleteSearchDocument(tx, "MEASURE", measureId);
    return;
  }

  await upsertSearchDocument(tx, {
    entityType: "MEASURE",
    entityId: measureId,
    title: reference.text.slice(0, MAX_TITLE_LENGTH),
    body: reference.text,
    url: `/elections/presidentielle-2027/mesures/${measureId}`,
    visibility: isPublic ? "PUBLIC" : "ADMIN_ONLY",
    sourceRevisionId: reference.id,
    // The revision's own updatedAt, read after the transition's writes. Passing `now`
    // would make the future search:audit report a few milliseconds of drift.
    sourceUpdatedAt: reference.updatedAt,
  });
}
