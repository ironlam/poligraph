import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation, getRequestMeta } from "@/lib/security";
import { pairMergeSchema, type PairMergeBody } from "@/lib/security/schemas/affair-pair";
import { mergeAffairs } from "@/services/affairs/reconciliation";
import { invalidateEntity } from "@/lib/cache";

/**
 * Human-confirmed merge of a duplicate pair, with its DUPLICATE ruling written in
 * the same transaction (issue #525).
 *
 * Refuses to delete a published affair whatever the caller asks: absorbing a draft
 * into a published fiche is supported, the reverse retires a page a reader can
 * reach. Two published affairs need a moderator to unpublish one first, so the
 * removal is a deliberate editorial act rather than a side effect of a merge.
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
        select: { id: true, updatedAt: true, politician: { select: { slug: true } } },
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
    const result = await mergeAffairs(keepId, removeId, {
      // The precheck above answers 409; this makes the service enforce it too,
      // in case the row is published between that read and the write.
      removeMustNotBePublished: true,
      audit: { ipAddress: meta.ip, userAgent: meta.userAgent },
      pairDecision: {
        otherAffairId: removeId,
        reviewedBy: "admin",
        notes: body.notes ?? null,
        signal: body.signal,
        keepUpdatedAt: keep.updatedAt,
        removeUpdatedAt: remove.updatedAt,
      },
    });

    // After the transaction commits, never before.
    invalidateEntity("affair");
    if (keep.politician?.slug) invalidateEntity("politician", keep.politician.slug);

    return NextResponse.json({ success: true, ...result });
  })
);
