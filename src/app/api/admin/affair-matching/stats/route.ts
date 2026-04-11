import { NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { db } from "@/lib/db";

export const GET = withAdminAuth(async () => {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [pendingUndecided, pendingNoMatch, rows] = await Promise.all([
    db.affairPoliticianDecision.count({
      where: { judgment: "UNDECIDED", reviewedAt: null },
    }),
    db.affairPoliticianDecision.count({
      where: { judgment: "NO_MATCH", reviewedAt: null },
    }),
    db.affairPoliticianDecision.groupBy({
      by: ["source", "judgment"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
  ]);

  return NextResponse.json({
    pendingUndecided,
    pendingNoMatch,
    last7Days: rows.map((r) => ({
      source: r.source,
      judgment: r.judgment,
      count: r._count._all,
    })),
  });
});
