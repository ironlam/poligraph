import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  countArticlesToLink,
  countRecentPressRejections,
  countRecentFailedSyncs,
} from "@/lib/admin/queue-counts";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { getPotentialDuplicateCount } from "@/lib/admin/dashboard";
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
    // Mêmes prédicats que le tableau de bord : une copie locale afficherait
    // l'historique dans la navigation et la charge sur /admin, au même écran.
    countArticlesToLink(),
    getPotentialDuplicateCount(),
    countRecentPressRejections(),
    countRecentFailedSyncs(),
    getPipelineHealthAll(),
    countCandidaciesHoldingBackMeasures(),
  ]);

  const response: AdminBadgeContract = {
    drafts: { affairs, politicians },
    moderation: { proposalsPending, proposalsConflict, reviewsPending },
    matching: { decisionsPending, articlesPending, duplicatesPending: duplicates },
    candidacies: { publicationPending: candidaciesPublicationPending },
    press: { rejectionsPending },
    operations: {
      failedPipelines: pipelineHealth.filter((pipeline) => pipeline.status === "critical").length,
      failedSyncs,
    },
  };

  return NextResponse.json(response);
});
