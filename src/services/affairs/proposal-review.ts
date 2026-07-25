import { db } from "@/lib/db";
import type { AffairStatus, ProposalStatus } from "@/generated/prisma";
import { trackStatusChange } from "@/services/affairs/status-tracking";
import {
  AFFAIR_PROPOSABLE_SELECT,
  buildPrismaData,
  detectDrift,
  ProposalValidationError,
  validatePatch,
  type ConflictDetail,
} from "@/services/affairs/proposals";

// Affaires v2, lot 1: human review of importer proposals.
//
// Cache invalidation is intentionally NOT done here. The service returns the
// affected slugs and the route invalidates after the transaction commits, so a
// rollback never leaves a purged cache behind.

export type AcceptResult =
  | {
      ok: true;
      affairId: string;
      affairSlug: string;
      politicianSlug: string;
      appliedFields: string[];
    }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "not_pending"; status: ProposalStatus }
  | { ok: false; reason: "invalid_patch"; issues: string[] }
  | { ok: false; reason: "conflict"; conflictDetail: ConflictDetail };

export type RejectResult =
  | { ok: true; affairId: string }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "not_pending"; status: ProposalStatus };

interface ReviewInput {
  proposalId: string;
  reviewedBy: string;
  reviewNotes?: string;
  requestMeta?: { ip?: string | null; userAgent?: string | null };
}

/**
 * Applies a pending proposal.
 *
 * Order is load-bearing: pending check, then patch validation, then a normalized
 * drift check against the live row, and only then a single transaction carrying
 * the affair write, the ModerationReview, the AuditLog and the state change.
 */
export async function acceptProposal(input: ReviewInput): Promise<AcceptResult> {
  const proposal = await db.affairUpdateProposal.findUnique({
    where: { id: input.proposalId },
    select: {
      id: true,
      affairId: true,
      importer: true,
      extractorVersion: true,
      status: true,
      proposedPatch: true,
      observedValues: true,
      confidence: true,
      rationale: true,
      source: true,
      sourceUrl: true,
      affair: {
        select: {
          id: true,
          slug: true,
          status: true,
          politician: { select: { slug: true } },
        },
      },
    },
  });

  if (!proposal) return { ok: false, reason: "not_found" };
  if (proposal.status !== "PENDING") {
    return { ok: false, reason: "not_pending", status: proposal.status };
  }

  let patch;
  try {
    patch = validatePatch(proposal.proposedPatch);
  } catch (error) {
    if (error instanceof ProposalValidationError) {
      return { ok: false, reason: "invalid_patch", issues: error.issues };
    }
    throw error;
  }

  const observedValues = (proposal.observedValues ?? {}) as Record<string, unknown>;
  const fields = Object.keys(observedValues);
  const previousStatus = proposal.affair.status;

  const outcome = await db.$transaction(async (tx) => {
    // Re-read inside the transaction: the drift check must see the row as it is
    // at write time, not as it was when the list page was rendered.
    const live = await tx.affair.findUnique({
      where: { id: proposal.affairId },
      select: AFFAIR_PROPOSABLE_SELECT,
    });
    if (!live) return { kind: "not_found" as const };

    const drift = detectDrift(observedValues, live as unknown as Record<string, unknown>);
    if (drift) {
      await tx.affairUpdateProposal.update({
        where: { id: proposal.id },
        data: {
          status: "CONFLICT",
          conflictDetail: drift,
          reviewedAt: new Date(),
          reviewedBy: input.reviewedBy,
          reviewNotes: input.reviewNotes ?? null,
        },
      });
      return { kind: "conflict" as const, drift };
    }

    await tx.affair.update({
      where: { id: proposal.affairId },
      data: buildPrismaData(patch),
    });

    await tx.moderationReview.create({
      data: {
        affairId: proposal.affairId,
        // The enum has no "applied patch" member; adding one means touching the
        // label maps too, which belongs to a later lot. appliedAt keeps this row
        // out of every moderation queue (they all filter on appliedAt: null).
        recommendation: "NEEDS_REVIEW",
        confidence: proposal.confidence,
        reasoning: buildReasoning(proposal.rationale, input.reviewNotes),
        model: `proposal:${proposal.importer}@${proposal.extractorVersion}`,
        appliedAt: new Date(),
        appliedBy: input.reviewedBy,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "Affair",
        entityId: proposal.affairId,
        userId: input.reviewedBy,
        ipAddress: input.requestMeta?.ip ?? null,
        userAgent: input.requestMeta?.userAgent ?? null,
        changes: {
          action: "PROPOSAL_ACCEPTED",
          proposalId: proposal.id,
          importer: proposal.importer,
          extractorVersion: proposal.extractorVersion,
          before: observedValues,
          after: JSON.parse(JSON.stringify(proposal.proposedPatch)),
        },
      },
    });

    await tx.affairUpdateProposal.update({
      where: { id: proposal.id },
      data: {
        status: "APPROVED",
        appliedAt: new Date(),
        reviewedAt: new Date(),
        reviewedBy: input.reviewedBy,
        reviewNotes: input.reviewNotes ?? null,
      },
    });

    return { kind: "applied" as const };
  });

  if (outcome.kind === "not_found") return { ok: false, reason: "not_found" };
  if (outcome.kind === "conflict") {
    return { ok: false, reason: "conflict", conflictDetail: outcome.drift };
  }

  // Timeline event, outside the transaction. It is display-only: the audit trail
  // already committed, so a failure here must not fail the acceptance.
  const newStatus = patch.status as AffairStatus | null | undefined;
  if (newStatus && newStatus !== previousStatus) {
    try {
      await trackStatusChange(proposal.affairId, previousStatus, newStatus, {
        type: proposal.source,
        url: proposal.sourceUrl ?? undefined,
        title: `Proposition ${proposal.importer} acceptée`,
      });
    } catch (error) {
      console.warn(
        `[proposals] trackStatusChange failed for affair ${proposal.affairId}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return {
    ok: true,
    affairId: proposal.affairId,
    affairSlug: proposal.affair.slug,
    politicianSlug: proposal.affair.politician.slug,
    appliedFields: fields,
  };
}

export async function rejectProposal(input: ReviewInput): Promise<RejectResult> {
  const proposal = await db.affairUpdateProposal.findUnique({
    where: { id: input.proposalId },
    select: { id: true, affairId: true, status: true, importer: true },
  });

  if (!proposal) return { ok: false, reason: "not_found" };
  if (proposal.status !== "PENDING") {
    return { ok: false, reason: "not_pending", status: proposal.status };
  }

  await db.$transaction(async (tx) => {
    await tx.affairUpdateProposal.update({
      where: { id: proposal.id },
      data: {
        status: "REJECTED",
        reviewedAt: new Date(),
        reviewedBy: input.reviewedBy,
        reviewNotes: input.reviewNotes ?? null,
      },
    });
    await tx.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "AffairUpdateProposal",
        entityId: proposal.id,
        userId: input.reviewedBy,
        ipAddress: input.requestMeta?.ip ?? null,
        userAgent: input.requestMeta?.userAgent ?? null,
        changes: {
          action: "PROPOSAL_REJECTED",
          affairId: proposal.affairId,
          importer: proposal.importer,
          reviewNotes: input.reviewNotes ?? null,
        },
      },
    });
  });

  // No cache invalidation: nothing about the affair changed.
  return { ok: true, affairId: proposal.affairId };
}

function buildReasoning(rationale: string, reviewNotes?: string): string {
  return reviewNotes ? `${rationale}\n\nNote de revue : ${reviewNotes}` : rationale;
}
