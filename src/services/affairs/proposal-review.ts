import { db, type DbTransactionClient } from "@/lib/db";
import type { AffairStatus, ProposalStatus } from "@/generated/prisma";
import { isValidSentenceSplit } from "@/lib/affairs/sentence-split";
import { trackStatusChange } from "@/services/affairs/status-tracking";
import {
  isAcceptableOfficialDecisionVerification,
  verifyProposalOfficialEvidence,
  type OfficialDecisionVerification,
} from "@/lib/affairs/official-decision-verification";
import {
  AFFAIR_PROPOSABLE_SELECT,
  buildPrismaData,
  detectDrift,
  parseAffairEventProposalContext,
  ProposalValidationError,
  type AffairEventProposalContext,
  type ConflictDetail,
} from "@/services/affairs/proposals";
import {
  normalizeAffairEventSourceUrl,
  parseAffairProposalPayload,
  type ParsedAffairProposal,
} from "@/lib/security/schemas/affair-proposal";
import { AffairNotFoundError, lockAffair } from "@/services/affairs/lock";

// Affaires v2, lot 1: human review of importer proposals.
//
// Two properties matter here.
//
// 1. Concurrency. The PENDING check is a conditional update inside the
//    transaction (compare-and-set), not a read before it. Two simultaneous
//    acceptances cannot both apply the patch: the second one finds count === 0
//    once the first commits, and rolls back.
// 2. Cache invalidation is NOT done here. The service returns the affected slugs
//    and the route invalidates after the commit, so a rollback never leaves a
//    purged cache behind.

export type AcceptResult =
  | {
      ok: true;
      affairId: string;
      affairSlug: string;
      politicianSlug: string;
      appliedFields: string[];
    }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "orphaned" }
  | { ok: false; reason: "not_pending"; status: ProposalStatus }
  | { ok: false; reason: "invalid_patch"; issues: string[] }
  | { ok: false; reason: "invalid_split"; issues: string[] }
  | {
      ok: false;
      reason: "evidence_unverified";
      verification: OfficialDecisionVerification;
    }
  | { ok: false; reason: "conflict"; conflictDetail: ConflictDetail };

export type RejectResult =
  | { ok: true; affairId: string | null }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "not_pending"; status: ProposalStatus };

interface ReviewInput {
  proposalId: string;
  reviewedBy: string;
  reviewNotes?: string;
  requestMeta?: { ip?: string | null; userAgent?: string | null };
}

/** Aborts the transaction while carrying a structured reason out of it. */
class RollbackSignal extends Error {
  constructor(
    readonly reason: "lost_race" | "affair_gone" | "invalid_split",
    readonly issues: string[] = []
  ) {
    super(`proposal review rollback: ${reason}`);
    this.name = "RollbackSignal";
  }
}

function validationIssues(error: unknown): string[] {
  if (error instanceof ProposalValidationError) return error.issues;
  if (error instanceof Error) return [error.message];
  return ["Payload invalide"];
}

/**
 * Checks the firm/suspended pairs against what the row actually holds (#576).
 *
 * The schema can only compare the two halves when the patch carries both, and an
 * importer routinely proposes one. This is the only point that sees the merge, so it is
 * the only place the invariant can be enforced for a partial patch.
 */
function splitIssues(live: Record<string, unknown>, patch: Record<string, unknown>): string[] {
  const merged = { ...live, ...patch };
  const pairs = [
    ["prisonMonths", "prisonFirmMonths", "la peine"],
    ["ineligibilityMonths", "ineligibilityFirmMonths", "l'inéligibilité"],
  ] as const;

  return pairs
    .filter(
      ([totalKey, firmKey]) =>
        !isValidSentenceSplit(
          (merged[totalKey] ?? null) as number | null,
          (merged[firmKey] ?? null) as number | null
        )
    )
    .map(([, firmKey, label]) => `${firmKey} : part ferme incompatible avec le total de ${label}`);
}

async function currentStatus(proposalId: string): Promise<ProposalStatus | null> {
  const row = await db.affairUpdateProposal.findUnique({
    where: { id: proposalId },
    select: { status: true },
  });
  return row?.status ?? null;
}

async function markConflict(
  tx: DbTransactionClient,
  proposal: { id: string; affairId: string | null; importer: string; extractorVersion: string },
  input: ReviewInput,
  drift: ConflictDetail
): Promise<{ kind: "conflict"; drift: ConflictDetail }> {
  await tx.affairUpdateProposal.update({
    where: { id: proposal.id },
    data: { status: "CONFLICT", conflictDetail: drift, appliedAt: null },
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
        action: "PROPOSAL_CONFLICT",
        affairId: proposal.affairId,
        importer: proposal.importer,
        extractorVersion: proposal.extractorVersion,
        conflictDetail: drift,
      },
    },
  });
  return { kind: "conflict", drift };
}

/**
 * Applies a pending proposal.
 *
 * Order is load-bearing: cheap rejections first, then patch validation, then a
 * single transaction carrying the compare-and-set claim, the normalized drift
 * check, the affair write, the ModerationReview, the AuditLog and the state
 * transition.
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
      sourceExcerpt: true,
      officialId: true,
      metadata: true,
      affair: {
        select: {
          id: true,
          slug: true,
          status: true,
          publicationStatus: true,
          politician: { select: { slug: true } },
        },
      },
    },
  });

  if (!proposal) return { ok: false, reason: "not_found" };
  if (proposal.status !== "PENDING") {
    return { ok: false, reason: "not_pending", status: proposal.status };
  }
  if (!proposal.affairId || !proposal.affair) {
    // The affair was deleted; the row survives as history (onDelete: SetNull)
    // but there is nothing left to patch.
    return { ok: false, reason: "orphaned" };
  }

  let parsed: ParsedAffairProposal;
  let eventContext: AffairEventProposalContext | null = null;
  try {
    parsed = parseAffairProposalPayload(proposal.proposedPatch);
    if (parsed.kind === "ADD_EVENT") {
      eventContext = parseAffairEventProposalContext({
        affairId: proposal.affairId,
        proposedPatch: proposal.proposedPatch,
        observedValues: proposal.observedValues,
        metadata: proposal.metadata,
        source: proposal.source,
        sourceUrl: proposal.sourceUrl,
        sourceExcerpt: proposal.sourceExcerpt,
      });
    }
  } catch (error) {
    return { ok: false, reason: "invalid_patch", issues: validationIssues(error) };
  }

  const officialEvidence = await verifyProposalOfficialEvidence({
    source: proposal.source,
    sourceUrl: proposal.sourceUrl,
    officialId: proposal.officialId,
    metadata: proposal.metadata,
  });
  if (
    officialEvidence &&
    !isAcceptableOfficialDecisionVerification(officialEvidence.verification)
  ) {
    return {
      ok: false,
      reason: "evidence_unverified",
      verification: officialEvidence.verification,
    };
  }

  const affairId = proposal.affairId;
  const observedValues = (proposal.observedValues ?? {}) as Record<string, unknown>;
  const fields = parsed.kind === "ADD_EVENT" ? ["event"] : Object.keys(observedValues);
  const now = new Date();

  let outcome:
    | {
        kind: "applied";
        affairSlug: string;
        politicianSlug: string;
        previousStatus: AffairStatus;
      }
    | { kind: "conflict"; drift: ConflictDetail };
  try {
    outcome = await db.$transaction(async (tx) => {
      // Compare-and-set: this is the concurrency gate. A second acceptance
      // blocks on the row lock, then finds no PENDING row once we commit.
      const claim = await tx.affairUpdateProposal.updateMany({
        where: { id: proposal.id, status: "PENDING" },
        data: {
          status: "APPROVED",
          appliedAt: now,
          reviewedAt: now,
          reviewedBy: input.reviewedBy,
          reviewNotes: input.reviewNotes ?? null,
        },
      });
      if (claim.count === 0) throw new RollbackSignal("lost_race");

      await lockAffair(tx, affairId);
      const live = await tx.affair.findUnique({
        where: { id: affairId },
        select: AFFAIR_PROPOSABLE_SELECT,
      });
      if (!live) throw new RollbackSignal("affair_gone");

      let eventId: string | null = null;
      if (parsed.kind === "PATCH") {
        const drift = detectDrift(observedValues, live as unknown as Record<string, unknown>);
        if (drift) return markConflict(tx, proposal, input, drift);

        const issues = splitIssues(
          live as unknown as Record<string, unknown>,
          parsed.patch as unknown as Record<string, unknown>
        );
        if (issues.length > 0) throw new RollbackSignal("invalid_split", issues);

        await tx.affair.update({
          where: { id: affairId },
          data: buildPrismaData(parsed.patch),
        });
      } else {
        const context = eventContext!;
        if (!new Set(["DRAFT", "PUBLISHED"]).has(live.publicationStatus)) {
          return markConflict(tx, proposal, input, {
            publicationStatus: {
              expected: "DRAFT|PUBLISHED",
              actual: live.publicationStatus,
            },
          });
        }

        let existingEvent = await tx.affairEvent.findUnique({
          where: {
            affairId_identityKey: { affairId, identityKey: context.identityKey },
          },
          select: { id: true },
        });
        if (!existingEvent) {
          const legacyEvents = await tx.affairEvent.findMany({
            where: {
              affairId,
              type: context.event.type,
              date: context.event.date,
            },
            select: { id: true, sourceUrl: true },
          });
          existingEvent =
            legacyEvents.find(
              (event) =>
                event.sourceUrl !== null &&
                normalizeAffairEventSourceUrl(event.sourceUrl) === context.normalizedSourceUrl
            ) ?? null;
        }
        if (existingEvent) {
          return markConflict(tx, proposal, input, {
            event: { expected: "absent", actual: existingEvent.id },
          });
        }

        const decisionId = context.metadata.eventProposal.resolverDecisionId ?? null;
        if (decisionId) {
          const decision = await tx.affairPoliticianDecision.findUnique({
            where: { id: decisionId },
            select: { affairId: true },
          });
          if (!decision || (decision.affairId !== null && decision.affairId !== affairId)) {
            return markConflict(tx, proposal, input, {
              resolverDecision: {
                expected: `absent|${affairId}`,
                actual: decision?.affairId ?? "introuvable",
              },
            });
          }
          if (decision.affairId === null) {
            const attached = await tx.affairPoliticianDecision.updateMany({
              where: { id: decisionId, affairId: null },
              data: { affairId },
            });
            if (attached.count === 0) {
              const racedDecision = await tx.affairPoliticianDecision.findUnique({
                where: { id: decisionId },
                select: { affairId: true },
              });
              if (racedDecision?.affairId !== affairId) {
                return markConflict(tx, proposal, input, {
                  resolverDecision: {
                    expected: `absent|${affairId}`,
                    actual: racedDecision?.affairId ?? "introuvable",
                  },
                });
              }
            }
          }
        }

        const createdEvent = await tx.affairEvent.create({
          data: { affairId, identityKey: context.identityKey, ...context.event },
          select: { id: true },
        });
        eventId = createdEvent.id;

        await tx.source.upsert({
          where: { affairId_url: { affairId, url: context.event.sourceUrl } },
          update: {},
          create: {
            affairId,
            url: context.event.sourceUrl,
            title: context.event.sourceTitle,
            publisher: context.metadata.eventProposal.publisher,
            publishedAt: context.metadata.eventProposal.publishedAt,
            sourceType: "PRESSE",
            excerpt: proposal.sourceExcerpt ?? null,
          },
        });

        const pressArticleId = context.metadata.eventProposal.pressArticleId ?? null;
        if (pressArticleId) {
          const link = await tx.pressArticleAffair.upsert({
            where: { articleId_affairId: { articleId: pressArticleId, affairId } },
            update: {},
            create: { articleId: pressArticleId, affairId, role: "UPDATE" },
            select: { id: true, role: true },
          });
          if (link.role === "MENTION") {
            await tx.pressArticleAffair.update({
              where: { id: link.id },
              data: { role: "UPDATE" },
            });
          }
        }
      }

      await tx.moderationReview.create({
        data: {
          affairId,
          // The enum has no "applied patch" member; adding one means touching the
          // label maps too, which belongs to a later lot. appliedAt keeps this row
          // out of every moderation queue (they all filter on appliedAt: null).
          recommendation: "NEEDS_REVIEW",
          confidence: proposal.confidence,
          reasoning: buildReasoning(proposal.rationale, input.reviewNotes),
          model: `proposal:${proposal.importer}@${proposal.extractorVersion}`,
          appliedAt: now,
          appliedBy: input.reviewedBy,
        },
      });

      await tx.auditLog.create({
        data: {
          action: "UPDATE",
          entityType: eventId ? "AffairEvent" : "Affair",
          entityId: eventId ?? affairId,
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

      return {
        kind: "applied" as const,
        affairSlug: live.slug,
        politicianSlug: live.politician.slug,
        previousStatus: live.status,
      };
    });
  } catch (error) {
    if (error instanceof RollbackSignal) {
      if (error.reason === "affair_gone") return { ok: false, reason: "orphaned" };
      // The rollback undid the APPROVED claim, so the proposal is PENDING again and the
      // reviewer sees why rather than a bare "not_pending".
      if (error.reason === "invalid_split") {
        return { ok: false, reason: "invalid_split", issues: error.issues };
      }
      const status = await currentStatus(proposal.id);
      return { ok: false, reason: "not_pending", status: status ?? "APPROVED" };
    }
    if (error instanceof AffairNotFoundError) return { ok: false, reason: "orphaned" };
    throw error;
  }

  if (outcome.kind === "conflict") {
    return { ok: false, reason: "conflict", conflictDetail: outcome.drift };
  }

  // Timeline event, outside the transaction. It is display-only: the audit trail
  // already committed, so a failure here must not fail the acceptance.
  const newStatus =
    parsed.kind === "PATCH" ? (parsed.patch.status as AffairStatus | null | undefined) : null;
  if (newStatus && newStatus !== outcome.previousStatus) {
    try {
      await trackStatusChange(affairId, outcome.previousStatus, newStatus, {
        type: proposal.source,
        url: proposal.sourceUrl ?? undefined,
        title: `Proposition ${proposal.importer} acceptée`,
      });
    } catch (error) {
      console.warn(
        `[proposals] trackStatusChange failed for affair ${affairId}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return {
    ok: true,
    affairId,
    affairSlug: outcome.affairSlug,
    politicianSlug: outcome.politicianSlug,
    appliedFields: fields,
  };
}

/**
 * Refuses a pending proposal. Never touches the affair, so no cache
 * invalidation. The state transition is the same compare-and-set as acceptance,
 * so two simultaneous rejections cannot both write an audit entry.
 */
export async function rejectProposal(input: ReviewInput): Promise<RejectResult> {
  const proposal = await db.affairUpdateProposal.findUnique({
    where: { id: input.proposalId },
    select: { id: true, affairId: true, status: true, importer: true },
  });

  if (!proposal) return { ok: false, reason: "not_found" };
  if (proposal.status !== "PENDING") {
    return { ok: false, reason: "not_pending", status: proposal.status };
  }

  const now = new Date();
  try {
    await db.$transaction(async (tx) => {
      const claim = await tx.affairUpdateProposal.updateMany({
        where: { id: proposal.id, status: "PENDING" },
        data: {
          status: "REJECTED",
          reviewedAt: now,
          reviewedBy: input.reviewedBy,
          reviewNotes: input.reviewNotes ?? null,
        },
      });
      if (claim.count === 0) throw new RollbackSignal("lost_race");

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
  } catch (error) {
    if (error instanceof RollbackSignal) {
      const status = await currentStatus(proposal.id);
      return { ok: false, reason: "not_pending", status: status ?? "REJECTED" };
    }
    throw error;
  }

  return { ok: true, affairId: proposal.affairId };
}

function buildReasoning(rationale: string, reviewNotes?: string): string {
  return reviewNotes ? `${rationale}\n\nNote de revue : ${reviewNotes}` : rationale;
}
