import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation, getRequestMeta } from "@/lib/security";
import { pairLinkSchema, type PairLinkBody } from "@/lib/security/schemas/affair-pair";
import { invalidateEntity } from "@/lib/cache";

/**
 * Publishes the relation between two affairs ruled LINKED (issue #525).
 *
 * Separate from the ruling and gated on an explicit confirmation, because
 * linkedAffairId is rendered on published fiches: classifying a pair must not
 * publish anything by itself. The field is also directional and holds a single
 * link, so overwriting an existing one has to be a visible choice.
 */
export const POST = withAdminAuth(
  withValidation(pairLinkSchema, async (request, _context, body: PairLinkBody) => {
    const { fromAffairId, toAffairId } = body;

    if (fromAffairId === toAffairId) {
      return NextResponse.json({ error: "Les deux affaires sont identiques" }, { status: 400 });
    }

    const [from, to] = await Promise.all([
      db.affair.findUnique({
        where: { id: fromAffairId },
        select: {
          id: true,
          linkedAffairId: true,
          politician: { select: { slug: true } },
        },
      }),
      db.affair.findUnique({ where: { id: toAffairId }, select: { id: true } }),
    ]);
    if (!from || !to) {
      return NextResponse.json({ error: "Affaire(s) non trouvée(s)" }, { status: 404 });
    }

    const replaced = from.linkedAffairId && from.linkedAffairId !== toAffairId;

    await db.affair.update({
      where: { id: fromAffairId },
      data: { linkedAffairId: toAffairId },
    });

    const meta = getRequestMeta(request);
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "Affair",
        entityId: fromAffairId,
        changes: {
          linkedAffairId: toAffairId,
          replacedLinkedAffairId: from.linkedAffairId ?? null,
        },
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    invalidateEntity("affair");
    if (from.politician?.slug) invalidateEntity("politician", from.politician.slug);

    return NextResponse.json({ success: true, replaced: Boolean(replaced) });
  })
);
