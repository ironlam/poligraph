import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/db";
import {
  countArticlesToLink,
  countRecentFailedSyncs,
  countRecentPressRejections,
} from "@/lib/admin/queue-counts";
import { getPipelineHealthAll } from "@/lib/data/pipelines";
import { findPotentialDuplicates } from "@/services/affairs/reconciliation";

export async function getDashboardCounts() {
  const rows = await db.$queryRaw<
    [
      {
        total_politicians: bigint;
        published_politicians: bigint;
        without_photo: bigint;
        draft_politicians: bigint;
        without_bio: bigint;
        total_affairs: bigint;
        draft_affairs: bigint;
        without_ecli: bigint;
      },
    ]
  >`
    SELECT COUNT(*) AS total_politicians,
      COUNT(*) FILTER (WHERE "publicationStatus" = 'PUBLISHED') AS published_politicians,
      COUNT(*) FILTER (WHERE "publicationStatus" = 'PUBLISHED' AND "photoUrl" IS NULL) AS without_photo,
      COUNT(*) FILTER (WHERE "publicationStatus" = 'DRAFT') AS draft_politicians,
      COUNT(*) FILTER (WHERE "publicationStatus" = 'PUBLISHED' AND "biography" IS NULL) AS without_bio,
      (SELECT COUNT(*) FROM "Affair") AS total_affairs,
      (SELECT COUNT(*) FROM "Affair" WHERE "publicationStatus" = 'DRAFT') AS draft_affairs,
      (SELECT COUNT(*) FROM "Affair" a WHERE a."publicationStatus" = 'PUBLISHED' AND NOT EXISTS (SELECT 1 FROM "AffairCourtDecision" acd WHERE acd."affairId" = a.id)) AS without_ecli
    FROM "Politician"
  `;
  const c = rows[0]!;
  const published = Number(c.published_politicians);
  const withoutPhoto = Number(c.without_photo);
  const withoutBio = Number(c.without_bio);
  const [proposalsPending, proposalsConflict, reviewsPending, decisionsPending, articlesPending] =
    await Promise.all([
      db.affairUpdateProposal.count({ where: { status: "PENDING" } }),
      db.affairUpdateProposal.count({ where: { status: "CONFLICT" } }),
      db.moderationReview.count({ where: { appliedAt: null } }),
      db.affairPoliticianDecision.count({ where: { judgment: "UNDECIDED", reviewedAt: null } }),
      countArticlesToLink(),
    ]);
  return {
    totalPoliticians: Number(c.total_politicians),
    totalAffairs: Number(c.total_affairs),
    affairsDraft: Number(c.draft_affairs),
    politiciansDraft: Number(c.draft_politicians),
    politiciansWithoutPhoto: withoutPhoto,
    biographiesMissing: withoutBio,
    affairsWithoutEcli: Number(c.without_ecli),
    completeness: published
      ? Math.round(((published - withoutPhoto + (published - withoutBio)) / (published * 2)) * 100)
      : 0,
    queues: {
      proposalsPending,
      proposalsConflict,
      reviewsPending,
      decisionsPending,
      articlesPending,
    },
  };
}

export async function getDashboardSecondaryData() {
  const [
    duplicates,
    pipelines,
    decisionsPending,
    rejectionsPending,
    failedSyncs,
    recentActivity,
    syncHistory,
  ] = await Promise.all([
    getPotentialDuplicateCount(),
    getPipelineHealthAll(),
    db.affairPoliticianDecision.count({ where: { judgment: "UNDECIDED", reviewedAt: null } }),
    countRecentPressRejections(),
    countRecentFailedSyncs(),
    db.auditLog.findMany({ take: 10, orderBy: { createdAt: "desc" } }),
    db.syncJob.findMany({ take: 10, orderBy: { createdAt: "desc" } }),
  ]);
  return {
    duplicates,
    decisionsPending,
    failedPipelines: pipelines.filter((pipeline) => pipeline.status === "critical").length,
    rejectionsPending,
    failedSyncs,
    recentActivity,
    syncHistory,
  };
}

/** Exact duplicate count, shared by the dashboard and sidebar for five minutes. */
export async function getPotentialDuplicateCount(): Promise<number> {
  "use cache";
  cacheLife("minutes");
  cacheTag("affair-duplicates");
  return (await findPotentialDuplicates()).length;
}
