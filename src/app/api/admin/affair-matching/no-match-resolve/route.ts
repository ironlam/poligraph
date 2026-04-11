import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation } from "@/lib/security/validate";
import { getRequestMeta } from "@/lib/security/audit";

const noMatchResolveSchema = z.object({
  decisionId: z.string().cuid(),
  action: z.enum(["OUT_OF_SCOPE", "CREATE_POLITICIAN", "MANUAL_PICK"]),
  chosenPoliticianId: z.string().cuid().optional(),
});

export const POST = withAdminAuth(
  withValidation(noMatchResolveSchema, async (request: NextRequest, _context, body) => {
    const { decisionId, action, chosenPoliticianId } = body;

    if ((action === "CREATE_POLITICIAN" || action === "MANUAL_PICK") && !chosenPoliticianId) {
      return NextResponse.json(
        { error: "chosenPoliticianId est requis pour cette action" },
        { status: 400 }
      );
    }

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

    let auditAction: string;

    if (action === "OUT_OF_SCOPE") {
      await db.affairPoliticianDecision.update({
        where: { id: decisionId },
        data: {
          judgment: "NOT_SAME",
          chosenPoliticianId: null,
          reviewedAt: new Date(),
          reviewedBy: "admin",
          reviewAction: "REJECTED_OUT_OF_SCOPE",
        },
      });
      auditAction = "AFFAIR_DECISION_NO_MATCH_OUT_OF_SCOPE";
    } else if (action === "CREATE_POLITICIAN") {
      await db.affairPoliticianDecision.update({
        where: { id: decisionId },
        data: {
          judgment: "SAME",
          chosenPoliticianId,
          reviewedAt: new Date(),
          reviewedBy: "admin",
          reviewAction: "CREATED_POLITICIAN",
        },
      });
      auditAction = "AFFAIR_DECISION_NO_MATCH_CREATED_POLITICIAN";
    } else {
      await db.affairPoliticianDecision.update({
        where: { id: decisionId },
        data: {
          judgment: "SAME",
          chosenPoliticianId,
          reviewedAt: new Date(),
          reviewedBy: "admin",
          reviewAction: "CONFIRMED",
        },
      });
      auditAction = "AFFAIR_DECISION_NO_MATCH_MANUAL_PICK";
    }

    const meta = getRequestMeta(request);
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "AffairPoliticianDecision",
        entityId: decisionId,
        changes: {
          action: auditAction,
          previousJudgment: decision.judgment,
          newJudgment: action === "OUT_OF_SCOPE" ? "NOT_SAME" : "SAME",
          chosenPoliticianId: chosenPoliticianId ?? null,
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
