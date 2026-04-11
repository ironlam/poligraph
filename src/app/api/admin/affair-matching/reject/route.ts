import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation } from "@/lib/security/validate";
import { getRequestMeta } from "@/lib/security/audit";
import { Prisma, type AffairPoliticianJudgment, type SourceType } from "@/generated/prisma";

const rejectSchema = z.object({
  decisionId: z.string().cuid(),
  action: z.enum(["MOVE_TO_NO_MATCH", "REJECT_OUT_OF_SCOPE"]),
  blocklistCandidateIds: z.array(z.string().cuid()).optional(),
});

export const POST = withAdminAuth(
  withValidation(rejectSchema, async (request: NextRequest, _context, body) => {
    const { decisionId, action, blocklistCandidateIds } = body;

    const decision = await db.affairPoliticianDecision.findUnique({
      where: { id: decisionId },
      select: {
        id: true,
        judgment: true,
        reviewedAt: true,
        textHash: true,
        source: true,
        sourceRef: true,
        candidateText: true,
        metadata: true,
        topScore: true,
        gap: true,
        resolverVersion: true,
      },
    });

    if (!decision) {
      return NextResponse.json({ error: "Decision not found" }, { status: 404 });
    }

    if (decision.reviewedAt !== null) {
      return NextResponse.json({ error: "Decision already reviewed" }, { status: 400 });
    }

    const newJudgment: AffairPoliticianJudgment =
      action === "MOVE_TO_NO_MATCH" ? "NO_MATCH" : "NOT_SAME";
    const newReviewAction = action === "REJECT_OUT_OF_SCOPE" ? "REJECTED_OUT_OF_SCOPE" : null;

    // Write blocklist NOT_SAME entries for each excluded candidate.
    // sourceRef is prefixed with "blocklist:" + candidateId so the unique constraint
    // @@unique([textHash, source, sourceRef]) is satisfied per-candidate.
    // loadBlocklist() in persistence.ts queries only by textHash + judgment=NOT_SAME,
    // so the modified sourceRef does not affect blocklist lookups.
    const ops: Prisma.PrismaPromise<unknown>[] = [
      db.affairPoliticianDecision.update({
        where: { id: decisionId },
        data: {
          judgment: newJudgment,
          reviewedAt: new Date(),
          reviewedBy: "admin",
          reviewAction: newReviewAction,
        },
      }),
    ];

    if (blocklistCandidateIds && blocklistCandidateIds.length > 0) {
      const blocklistData = blocklistCandidateIds.map((candidateId) => ({
        textHash: decision.textHash,
        candidateText: decision.candidateText,
        metadata: decision.metadata ?? Prisma.DbNull,
        judgment: "NOT_SAME" as AffairPoliticianJudgment,
        topCandidates: [],
        topScore: 0,
        gap: 0,
        resolverVersion: decision.resolverVersion,
        source: decision.source as SourceType,
        sourceRef: `blocklist:${candidateId}:${decision.sourceRef}`,
        chosenPoliticianId: candidateId,
        reviewedAt: new Date(),
        reviewedBy: "admin",
      }));

      ops.push(
        db.affairPoliticianDecision.createMany({
          data: blocklistData,
          skipDuplicates: true,
        })
      );
    }

    await db.$transaction(ops);

    const meta = getRequestMeta(request);
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "AffairPoliticianDecision",
        entityId: decisionId,
        changes: {
          action:
            action === "MOVE_TO_NO_MATCH"
              ? "AFFAIR_DECISION_MOVED_TO_NO_MATCH"
              : "AFFAIR_DECISION_REJECTED_OUT_OF_SCOPE",
          previousJudgment: decision.judgment,
          newJudgment,
          blocklistCandidateIds: blocklistCandidateIds ?? [],
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
