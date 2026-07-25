import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation, getRequestMeta } from "@/lib/security";
import { pairMergeSchema, type PairMergeBody } from "@/lib/security/schemas/affair-pair";
import { mergeAffairs } from "@/services/affairs/reconciliation";
import { absorbDraftIntoPublished } from "@/services/affairs/absorb-draft";
import { withImportRun, IMPORTER_MANUAL_ADMIN } from "@/services/affairs/import-run";
import { invalidateEntity } from "@/lib/cache";

/**
 * Human-confirmed merge of a duplicate pair, with its DUPLICATE ruling written in
 * the same transaction (issue #525).
 *
 * Refuses to delete a published affair whatever the caller asks: absorbing a draft
 * into a published fiche is supported, the reverse retires a page a reader can
 * reach. Two published affairs need a moderator to unpublish one first, so the
 * removal is a deliberate editorial act rather than a side effect of a merge.
 *
 * When the survivor is published, the absorption path runs instead of a plain
 * merge: it fills court-assigned identifiers only and turns everything the draft
 * states about the judicial outcome into proposals, so confirming a merge cannot
 * silently rewrite a published record (issue #525, §4).
 */
export const POST = withAdminAuth(
  withValidation(pairMergeSchema, async (request, _context, body: PairMergeBody) => {
    const { keepId, removeId } = body;

    if (keepId === removeId) {
      return NextResponse.json({ error: "Les deux affaires sont identiques" }, { status: 400 });
    }

    const [keep, remove] = await Promise.all([
      db.affair.findUnique({
        where: { id: keepId },
        select: {
          id: true,
          updatedAt: true,
          publicationStatus: true,
          politician: { select: { slug: true } },
        },
      }),
      db.affair.findUnique({
        where: { id: removeId },
        select: { id: true, updatedAt: true, publicationStatus: true },
      }),
    ]);
    if (!keep || !remove) {
      return NextResponse.json({ error: "Affaire(s) non trouvée(s)" }, { status: 404 });
    }

    if (remove.publicationStatus === "PUBLISHED") {
      return NextResponse.json(
        {
          error:
            "Une affaire publiée ne peut pas être supprimée par une fusion. Dépubliez-la d'abord.",
        },
        { status: 409 }
      );
    }

    const meta = getRequestMeta(request);
    // The plain merge needs the timestamps here; the absorption path re-reads them
    // inside its own transaction, so it takes only the reviewer and the signal.
    const ruling = {
      reviewedBy: "admin",
      notes: body.notes ?? null,
      signal: body.signal,
    };
    const timestamps = { keepUpdatedAt: keep.updatedAt, removeUpdatedAt: remove.updatedAt };

    let result;
    let proposalsCreated = 0;
    if (keep.publicationStatus === "PUBLISHED") {
      // The run is opened around the transaction, not inside it: its own state is
      // bookkeeping, and withImportRun() guarantees it never stays RUNNING. The
      // business atomicity is the transaction inside absorbDraftIntoPublished().
      const absorbed = await withImportRun(IMPORTER_MANUAL_ADMIN, ({ importRunId }) =>
        absorbDraftIntoPublished({
          publishedId: keepId,
          draftId: removeId,
          importRunId,
          reason: `Fusion confirmée en revue des doublons (${body.signal.matchedBy}/${body.signal.confidence})`,
          pairDecision: ruling,
          audit: { ipAddress: meta.ip, userAgent: meta.userAgent },
        })
      );
      proposalsCreated = absorbed.proposalsCreated;
      result = {
        proposedFields: absorbed.proposedFields,
        slugsPreserved: absorbed.slugsPreserved,
      };
    } else {
      result = await mergeAffairs(keepId, removeId, {
        // The precheck above answers 409; this makes the service enforce it too,
        // in case the row is published between that read and the write.
        removeMustNotBePublished: true,
        audit: { ipAddress: meta.ip, userAgent: meta.userAgent },
        pairDecision: { otherAffairId: removeId, ...ruling, ...timestamps },
      });
    }

    // After the transaction commits, never before.
    invalidateEntity("affair");
    if (keep.politician?.slug) invalidateEntity("politician", keep.politician.slug);

    return NextResponse.json({ success: true, proposalsCreated, ...result });
  })
);
