import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation } from "@/lib/security/validate";
import { getRequestMeta } from "@/lib/security/audit";

const confirmSchema = z.object({
  decisionId: z.string().cuid(),
  chosenPoliticianId: z.string().cuid(),
});

export const POST = withAdminAuth(
  withValidation(confirmSchema, async (request: NextRequest, _context, body) => {
    const { decisionId, chosenPoliticianId } = body;

    const decision = await db.affairPoliticianDecision.findUnique({
      where: { id: decisionId },
      select: { id: true, judgment: true, reviewedAt: true, source: true, sourceRef: true },
    });

    if (!decision) {
      return NextResponse.json({ error: "Decision not found" }, { status: 404 });
    }

    if (decision.reviewedAt !== null) {
      return NextResponse.json({ error: "Decision already reviewed" }, { status: 400 });
    }

    const updated = await db.affairPoliticianDecision.update({
      where: { id: decisionId },
      data: {
        judgment: "SAME",
        chosenPoliticianId,
        reviewedAt: new Date(),
        reviewedBy: "admin",
        reviewAction: "CONFIRMED",
      },
    });

    const meta = getRequestMeta(request);
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "AffairPoliticianDecision",
        entityId: decisionId,
        changes: {
          action: "AFFAIR_DECISION_CONFIRMED",
          previousJudgment: decision.judgment,
          newJudgment: updated.judgment,
          chosenPoliticianId,
          source: decision.source,
          sourceRef: decision.sourceRef,
        },
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    return NextResponse.json({ ok: true });
  })
);
