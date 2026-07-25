/**
 * Absorbing a draft into a published affair.
 *
 * The published fiche always survives and is never rewritten by this path. A merge
 * is allowed to carry over what the absorbed row held in addition — its sources,
 * its events, the court-assigned identifiers the published fiche lacks — but
 * everything the draft *states* about the judicial outcome goes through the
 * proposal queue instead, so a human decides whether a published record changes
 * (issue #525, §4).
 *
 * Only reached from a confirmed admin action. The automatic planner never chooses
 * this path: a shared court identifier means a shared decision, not a shared
 * editorial affair, so nothing crosses the published boundary without a person.
 *
 * Everything runs in one transaction. An earlier version merged first and proposed
 * afterwards: a proposal failing after that commit left the draft already deleted,
 * and whatever it stated about status, verdict date, court or sentence was lost
 * with no proposal to show for it. `withImportRun()` did not help — it tracks a
 * run, it does not span a transaction.
 */

import { db } from "@/lib/db";
import type { SourceType } from "@/generated/prisma";
import {
  mergeAffairsInTransaction,
  ABSORPTION_ADDITIVE_FIELDS,
  type AdditiveMergeField,
} from "./reconciliation";
import {
  normalizeForCompare,
  recordPendingProposalInTransaction,
  type LiveAffair,
} from "./proposals";

/**
 * Fields a draft may contribute to a published fiche, through review only.
 *
 * The proposal whitelist minus the identifiers the merge carries over directly.
 * `court` sits here rather than in the merge: it names the jurisdiction rather than
 * identifying the decision, so even filling a gap is a review call.
 *
 * None of these is auto-applicable, so this path only ever needs the PENDING
 * write, never the auto-apply branch of proposeAffairUpdate().
 */
const PROPOSABLE_FROM_DRAFT = [
  "status",
  "verdictDate",
  "court",
  "sentence",
  "prisonMonths",
  "prisonSuspended",
  "fineAmount",
  "ineligibilityMonths",
  "communityService",
  "otherSentence",
] as const;

/**
 * Differences that survive the merge without being carried or proposed.
 *
 * The published wording is authoritative once the pair is proven to be one
 * decision, so these are not blockers. They go to the merge audit trail rather
 * than being dropped, because the absorbed row is deleted.
 */
const RECORDED_ONLY_FIELDS = ["title", "description", "category"] as const;

export interface AbsorbDraftInput {
  publishedId: string;
  draftId: string;
  importRunId: string;
  /**
   * Who is absorbing. Recorded on the proposal, and it must match the importer the
   * surrounding ImportRun was opened with: a confirmed admin merge filed under an
   * automatic importer would misattribute the write and, worse, could dedupe
   * against an old automatic proposal, since the importer is part of payloadHash.
   *
   * Required rather than defaulted: the previous hard-coded value was the bug.
   */
  importer: string;
  /** The merge plan's reason, kept verbatim in the audit trail and rationale. */
  reason: string;
  additiveFields?: readonly AdditiveMergeField[];
  /** Recorded with the merge so the ruling commits with it. */
  pairDecision?: {
    reviewedBy: string;
    notes?: string | null;
    signal: { confidence: string; matchedBy: string; score: number };
  };
  audit?: { ipAddress?: string | null; userAgent?: string | null };
}

export interface AbsorbDraftResult {
  proposalsCreated: number;
  proposedFields: string[];
  recordedDifferences: string[];
  slugsPreserved: string[];
}

const AFFAIR_ABSORB_SELECT = {
  id: true,
  slug: true,
  publicId: true,
  title: true,
  description: true,
  category: true,
  status: true,
  verdictDate: true,
  court: true,
  sentence: true,
  prisonMonths: true,
  prisonSuspended: true,
  fineAmount: true,
  ineligibilityMonths: true,
  communityService: true,
  otherSentence: true,
  publicationStatus: true,
  updatedAt: true,
  politician: { select: { slug: true, fullName: true } },
  sources: { select: { sourceType: true, url: true }, take: 1 },
} as const;

export async function absorbDraftIntoPublished(
  input: AbsorbDraftInput
): Promise<AbsorbDraftResult> {
  return db.$transaction(async (tx) => {
    // Read inside the transaction. A caller's precheck can be stale, and the two
    // updatedAt below become the reference the ruling is judged against.
    const [published, draft] = await Promise.all([
      tx.affair.findUnique({ where: { id: input.publishedId }, select: AFFAIR_ABSORB_SELECT }),
      tx.affair.findUnique({ where: { id: input.draftId }, select: AFFAIR_ABSORB_SELECT }),
    ]);
    if (!published) throw new Error(`Affaire publiée introuvable : ${input.publishedId}`);
    if (!draft) throw new Error(`Brouillon introuvable : ${input.draftId}`);

    // Re-checked here rather than trusted from the caller: absorbing the wrong way
    // deletes a public page.
    if (published.publicationStatus !== "PUBLISHED") {
      throw new Error(`L'affaire survivante n'est pas publiée : ${input.publishedId}`);
    }
    if (draft.publicationStatus !== "DRAFT") {
      throw new Error(`L'affaire absorbée n'est pas un brouillon : ${input.draftId}`);
    }

    const live = published as unknown as Record<string, unknown>;
    const incoming = draft as unknown as Record<string, unknown>;

    // What the draft states that the published fiche does not.
    const patch: Record<string, unknown> = {};
    for (const field of PROPOSABLE_FROM_DRAFT) {
      const value = incoming[field];
      if (value === null || value === undefined) continue;
      if (normalizeForCompare(value) === normalizeForCompare(live[field])) continue;
      patch[field] = value;
    }

    const recordedDifferences = RECORDED_ONLY_FIELDS.filter(
      (field) => normalizeForCompare(incoming[field]) !== normalizeForCompare(live[field])
    );

    // Proposals first, deliberately: if this write fails, the draft is still there
    // and nothing has moved. The reverse order is what made the old path lossy.
    let proposalsCreated = 0;
    if (Object.keys(patch).length > 0) {
      const source = draft.sources[0];
      const outcome = await recordPendingProposalInTransaction(
        tx,
        {
          affairId: input.publishedId,
          importer: input.importer,
          importRunId: input.importRunId,
          patch,
          source: (source?.sourceType ?? "PRESSE") as SourceType,
          sourceUrl: source?.url ?? null,
          confidence: 70,
          rationale:
            `Absorption d'un brouillon dans cette affaire publiée. ${input.reason}. ` +
            `Le brouillon renseignait ces champs différemment ; l'affaire publiée n'a pas ` +
            `été modifiée automatiquement.`,
        },
        patch,
        published as unknown as LiveAffair
      );
      proposalsCreated = outcome.deduped ? 0 : 1;
    }

    const merge = await mergeAffairsInTransaction(tx, input.publishedId, input.draftId, {
      additiveFields: input.additiveFields ?? ABSORPTION_ADDITIVE_FIELDS,
      removeMustNotBePublished: true,
      audit: input.audit,
      auditNotes: {
        absorbedDraft: input.draftId,
        reason: input.reason,
        proposedFields: Object.keys(patch),
        // Kept because the absorbed row no longer exists to be consulted.
        recordedDifferences: recordedDifferences.map((field) => ({
          field,
          absorbedValue: String(incoming[field] ?? ""),
        })),
      },
      ...(input.pairDecision
        ? {
            pairDecision: {
              otherAffairId: input.draftId,
              reviewedBy: input.pairDecision.reviewedBy,
              notes: input.pairDecision.notes,
              signal: input.pairDecision.signal,
              // From the rows read in this transaction, not from the precheck.
              keepUpdatedAt: published.updatedAt,
              removeUpdatedAt: draft.updatedAt,
            },
          }
        : {}),
    });

    return {
      proposalsCreated,
      proposedFields: Object.keys(patch),
      recordedDifferences,
      slugsPreserved: merge.slugsPreserved,
    };
  });
}
