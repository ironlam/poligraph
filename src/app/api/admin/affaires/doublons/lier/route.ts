import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation, getRequestMeta } from "@/lib/security";
import { pairLinkSchema, type PairLinkBody } from "@/lib/security/schemas/affair-pair";
import { canonicalPair } from "@/services/affairs/affair-pair";
import { invalidateEntity } from "@/lib/cache";

/**
 * Publishes the relation between two affairs already ruled LINKED (issue #525).
 *
 * Separate from the ruling and gated three ways, because `linkedAffairId` is
 * rendered on published fiches: classifying a pair must never publish anything by
 * itself, the pair must actually carry a current LINKED ruling, and replacing an
 * existing link must be asked for explicitly rather than confirmed in a dialog.
 */
export const POST = withAdminAuth(
  withValidation(pairLinkSchema, async (request, _context, body: PairLinkBody) => {
    const { fromAffairId, toAffairId } = body;

    if (fromAffairId === toAffairId) {
      return NextResponse.json({ error: "Les deux affaires sont identiques" }, { status: 400 });
    }

    const { key } = canonicalPair(fromAffairId, toAffairId);
    const [from, to, ruling] = await Promise.all([
      db.affair.findUnique({
        where: { id: fromAffairId },
        select: { id: true, linkedAffairId: true, politician: { select: { slug: true } } },
      }),
      db.affair.findUnique({ where: { id: toAffairId }, select: { id: true } }),
      db.affairPairDecision.findUnique({
        where: { pairKey: key },
        select: { classification: true },
      }),
    ]);

    if (!from || !to) {
      return NextResponse.json({ error: "Affaire(s) non trouvée(s)" }, { status: 404 });
    }

    // Publishing a relation is the second half of a LINKED ruling, never a
    // standalone action: without the ruling there is no reviewed basis for it.
    if (ruling?.classification !== "LINKED") {
      return NextResponse.json(
        {
          error:
            "Aucune décision « affaires liées » courante pour cette paire. Classez-la d'abord.",
        },
        { status: 409 }
      );
    }

    const replacing = Boolean(from.linkedAffairId && from.linkedAffairId !== toAffairId);
    if (replacing && body.confirmReplacement !== true) {
      return NextResponse.json(
        {
          error:
            "Cette affaire porte déjà un lien vers une autre. Renvoyez la demande avec confirmReplacement.",
          currentLinkedAffairId: from.linkedAffairId,
        },
        { status: 409 }
      );
    }

    const meta = getRequestMeta(request);
    // One transaction: a published link without its audit entry would leave no
    // trace of what relation was dropped.
    await db.$transaction(async (tx) => {
      await tx.affair.update({
        where: { id: fromAffairId },
        data: { linkedAffairId: toAffairId },
      });
      await tx.auditLog.create({
        data: {
          action: "UPDATE",
          entityType: "Affair",
          entityId: fromAffairId,
          changes: {
            linkedAffairId: toAffairId,
            replacedLinkedAffairId: from.linkedAffairId ?? null,
            pairKey: key,
          },
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
        },
      });
    });

    // After the transaction commits, never before.
    invalidateEntity("affair");
    if (from.politician?.slug) invalidateEntity("politician", from.politician.slug);

    return NextResponse.json({ success: true, replaced: replacing });
  })
);
