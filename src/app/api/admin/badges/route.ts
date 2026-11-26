import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { countRecentFailedSyncs } from "@/lib/admin/queue-counts";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { getPotentialDuplicateCount } from "@/lib/admin/dashboard";
import { getPipelineHealthAll } from "@/lib/data/pipelines";
import { countCandidaciesHoldingBackMeasures } from "@/lib/data/measures";

export interface AdminBadgeContract {
  drafts: { affairs: number };
  moderation: {
    proposalsPending: number;
    proposalsConflict: number;
    reviewsPending: number;
  };
  matching: { duplicatesPending: number };
  /** Candidatures dont les mesures publiables restent derrière une extension non publiée. */
  candidacies: { publicationPending: number };
  operations: { failedPipelines: number; failedSyncs: number };
}

export const GET = withAdminAuth(async () => {
  const [
    affairs,
    proposalsPending,
    proposalsConflict,
    reviewsPending,
    duplicates,
    failedSyncs,
    pipelineHealth,
    candidaciesPublicationPending,
  ] = await Promise.all([
    db.affair.count({ where: { publicationStatus: "DRAFT" } }),
    db.affairUpdateProposal.count({ where: { status: "PENDING" } }),
    db.affairUpdateProposal.count({ where: { status: "CONFLICT" } }),
    db.moderationReview.count({ where: { appliedAt: null } }),
    getPotentialDuplicateCount(),
    countRecentFailedSyncs(),
    getPipelineHealthAll(),
    countCandidaciesHoldingBackMeasures(),
  ]);

  const response: AdminBadgeContract = {
    drafts: { affairs },
    moderation: { proposalsPending, proposalsConflict, reviewsPending },
    matching: { duplicatesPending: duplicates },
    candidacies: { publicationPending: candidaciesPublicationPending },
    operations: {
      failedPipelines: pipelineHealth.filter((pipeline) => pipeline.status === "critical").length,
      failedSyncs,
    },
  };

  return NextResponse.json(response);
});
