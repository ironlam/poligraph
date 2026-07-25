import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation } from "@/lib/security";
import { pairDecisionSchema, type PairDecisionBody } from "@/lib/security/schemas/affair-pair";
import { recordPairDecision } from "@/services/affairs/pair-decision";

/**
 * Records a ruling that does not move data: LINKED, DISTINCT or UNCERTAIN.
 *
 * LINKED stops here on purpose. It notes that two fiches belong to the same story;
 * publishing that relation is a separate, confirmed editorial act, because
 * linkedAffairId is rendered on published pages (issue #525).
 */
export const POST = withAdminAuth(
  withValidation(pairDecisionSchema, async (_request, _context, body: PairDecisionBody) => {
    if (body.affairIdA === body.affairIdB) {
      return NextResponse.json({ error: "Les deux affaires sont identiques" }, { status: 400 });
    }

    const affairs = await db.affair.findMany({
      where: { id: { in: [body.affairIdA, body.affairIdB] } },
      select: { id: true, updatedAt: true },
    });
    if (affairs.length !== 2) {
      return NextResponse.json({ error: "Affaire(s) non trouvée(s)" }, { status: 404 });
    }
    const updatedAt = new Map(affairs.map((a) => [a.id, a.updatedAt]));

    const id = await recordPairDecision({
      affairIdA: body.affairIdA,
      affairIdB: body.affairIdB,
      classification: body.classification,
      reviewedBy: "admin",
      notes: body.notes ?? null,
      signal: body.signal,
      affairAUpdatedAt: updatedAt.get(body.affairIdA)!,
      affairBUpdatedAt: updatedAt.get(body.affairIdB)!,
    });

    return NextResponse.json({ success: true, decisionId: id });
  })
);
