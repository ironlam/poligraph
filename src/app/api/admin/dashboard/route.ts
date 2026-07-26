import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";

export const GET = withAdminAuth(async () => {
  const [
    totalPoliticians,
    politiciansWithoutPhoto,
    politiciansDraft,
    biographiesMissing,
    totalAffairs,
    affairsDraft,
    affairsWithoutEcli,
    recentActivity,
    syncHistory,
  ] = await Promise.all([
    db.politician.count(),
    db.politician.count({ where: { photoUrl: null, publicationStatus: "PUBLISHED" } }),
    db.politician.count({ where: { publicationStatus: "DRAFT" } }),
    db.politician.count({ where: { biography: null, publicationStatus: "PUBLISHED" } }),
    db.affair.count(),
    db.affair.count({ where: { publicationStatus: "DRAFT" } }),
    // « Sans référence judiciaire » se mesure sur les décisions rattachées, la
    // colonne ayant été retirée d'Affair (#545).
    db.affair.count({
      where: { courtDecisions: { none: {} }, publicationStatus: "PUBLISHED" },
    }),
    db.auditLog.findMany({
      take: 20,
      orderBy: { createdAt: "desc" },
    }),
    db.syncJob.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    dataHealth: {
      totalPoliticians,
      politiciansWithoutPhoto,
      politiciansDraft,
      biographiesMissing,
      totalAffairs,
      affairsDraft,
      affairsWithoutEcli,
    },
    recentActivity,
    syncHistory,
  });
});
