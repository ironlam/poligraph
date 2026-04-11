import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { parsePagination } from "@/lib/api/pagination";
import { AffairPoliticianJudgment } from "@/generated/prisma";

const querySchema = z.object({
  tab: z.enum(["UNDECIDED", "NO_MATCH"]),
});

export const GET = withAdminAuth(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);

  const parsed = querySchema.safeParse({
    tab: searchParams.get("tab"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation error",
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      },
      { status: 400 }
    );
  }

  const { tab } = parsed.data;
  const { page, limit, skip } = parsePagination(searchParams, { defaultLimit: 20, maxLimit: 100 });

  const where = {
    judgment: tab as AffairPoliticianJudgment,
    reviewedAt: null,
  };

  const [rows, total] = await Promise.all([
    db.affairPoliticianDecision.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        candidateText: true,
        metadata: true,
        topCandidates: true,
        topScore: true,
        gap: true,
        source: true,
        sourceRef: true,
        createdAt: true,
      },
    }),
    db.affairPoliticianDecision.count({ where }),
  ]);

  return NextResponse.json({
    rows: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});
