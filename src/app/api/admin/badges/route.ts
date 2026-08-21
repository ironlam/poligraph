import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { findPotentialDuplicates } from "@/services/affairs/reconciliation";
import { getPipelineHealthAll } from "@/lib/data/pipelines";
import { countCandidaciesHoldingBackMeasures } from "@/lib/data/measures";

export interface AdminBadgeContract {
  drafts: { affairs: number; politicians: number };
  moderation: {
    proposalsPending: number;
    proposalsConflict: number;
    reviewsPending: number;
  };
  matching: { decisionsPending: number; articlesPending: number; duplicatesPending: number };
  /** Candidatures dont les mesures publiables restent derrière une extension non publiée. */
  candidacies: { publicationPending: number };
  press: { rejectionsPending: number };
  operations: { failedPipelines: number; failedSyncs: number };
}

export const GET = withAdminAuth(async () => {
  const [
    affairs,
    politicians,
    proposalsPending,
    proposalsConflict,
    reviewsPending,
    decisionsPending,
    articlesPending,
    duplicates,
    rejectionsPending,
    failedSyncs,
    pipelineHealth,
    candidaciesPublicationPending,
  ] = await Promise.all([
    db.affair.count({ where: { publicationStatus: "DRAFT" } }),
    db.politician.count({ where: { publicationStatus: "DRAFT" } }),
    db.affairUpdateProposal.count({ where: { status: "PENDING" } }),
    db.affairUpdateProposal.count({ where: { status: "CONFLICT" } }),
    db.moderationReview.count({ where: { appliedAt: null } }),
    db.affairPoliticianDecision.count({
      where: { judgment: "UNDECIDED", reviewedAt: null },
    }),
    db.pressArticle.count({
      where: { aiAnalyzedAt: { not: null }, isAffairRelated: true, affairLinks: { none: {} } },
    }),
    findPotentialDuplicates(),
    db.pressAnalysisRejection.count(),
    db.syncJob.count({ where: { status: "FAILED" } }),
    getPipelineHealthAll(),
    countCandidaciesHoldingBackMeasures(),
  ]);

  const response: AdminBadgeContract = {
    drafts: { affairs, politicians },
    moderation: { proposalsPending, proposalsConflict, reviewsPending },
    matching: { decisionsPending, articlesPending, duplicatesPending: duplicates.length },
    candidacies: { publicationPending: candidaciesPublicationPending },
    press: { rejectionsPending },
    operations: {
      failedPipelines: pipelineHealth.filter((pipeline) => pipeline.status === "critical").length,
      failedSyncs,
    },
  };

  return NextResponse.json(response);
});
