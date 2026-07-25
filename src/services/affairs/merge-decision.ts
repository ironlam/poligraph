/**
 * What may be done with a detected duplicate pair, and by whom.
 *
 * Detection was widened to published affairs (issue #525), which means the same
 * queue now holds pairs that may be folded by a cron and pairs that must never
 * be touched without a human. Keeping that judgement in one pure function makes
 * it testable and keeps the rule out of the executor.
 *
 * The asymmetry is deliberate: a wrong merge between drafts costs a re-split of
 * material nobody has read, while a wrong merge involving a published affair
 * deletes a page, mixes two sets of judicial facts about a named person, and
 * retires a URL. So automation stops at the published boundary unless an official
 * identifier proves the two rows describe one decision.
 */

import type { PublicationStatus, SourceType } from "@/generated/prisma";
import { isDeterministicMatch, type MatchConfidence } from "./matching";

/** Statuses this lot handles. See the issue for ARCHIVED/EXCLUDED/REJECTED. */
const MERGEABLE_STATUSES: ReadonlySet<PublicationStatus> = new Set([
  "DRAFT",
  "PUBLISHED",
] as PublicationStatus[]);

export type MergeDecision =
  | "AUTO_MERGE_DRAFTS"
  | "AUTO_ABSORB_DRAFT_INTO_PUBLISHED"
  | "REVIEW_REQUIRED"
  | "NOT_ELIGIBLE";

export interface MergeDecisionAffair {
  id: string;
  publicationStatus: PublicationStatus;
  verifiedAt: Date | null;
  sources: SourceType[];
}

export interface MergeDecisionInput {
  affairA: MergeDecisionAffair;
  affairB: MergeDecisionAffair;
  confidence: MatchConfidence;
  matchedBy: string;
  /**
   * Fields whose values rule out that the two rows describe one decision, such as
   * verdict dates months apart. Any contradiction sends the pair to review.
   */
  contradictions?: string[];
  /**
   * Sensitive fields the two rows state differently that a merge could neither
   * write nor turn into a proposal, so absorbing would drop a claim in silence.
   */
  unpropagatableDifferences?: string[];
}

export interface MergePlan {
  decision: MergeDecision;
  /** Survivor and absorbed, set only for the two automatic decisions. */
  keepId?: string;
  removeId?: string;
  /** Why, in French: surfaced in the review queue and in the merge audit trail. */
  reason: string;
}

/**
 * Survivor between two drafts: the richer row, then the lower id.
 *
 * The id tie-break is what makes the plan deterministic. Without it the outcome
 * would depend on which side detection happened to label A, which varies with
 * row order (requirement 12).
 */
function pickDraftSurvivor(
  a: MergeDecisionAffair,
  b: MergeDecisionAffair
): [keep: MergeDecisionAffair, remove: MergeDecisionAffair] {
  if (a.sources.length !== b.sources.length) {
    return a.sources.length > b.sources.length ? [a, b] : [b, a];
  }
  return a.id < b.id ? [a, b] : [b, a];
}

export function decideMergeAction(input: MergeDecisionInput): MergePlan {
  const { affairA: a, affairB: b, confidence, matchedBy } = input;
  const contradictions = input.contradictions ?? [];
  const unpropagatable = input.unpropagatableDifferences ?? [];

  if (a.id === b.id) {
    return { decision: "NOT_ELIGIBLE", reason: "Une affaire ne peut pas fusionner avec elle-même" };
  }

  for (const affair of [a, b]) {
    if (!MERGEABLE_STATUSES.has(affair.publicationStatus)) {
      return {
        decision: "NOT_ELIGIBLE",
        reason: `Statut hors périmètre : ${affair.publicationStatus}`,
      };
    }
  }

  // Contradictory judicial data means the pair may not be one affair at all.
  if (contradictions.length > 0) {
    return {
      decision: "REVIEW_REQUIRED",
      reason: `Données judiciaires contradictoires : ${contradictions.join(", ")}`,
    };
  }

  const confident = confidence === "CERTAIN" || confidence === "HIGH";
  const aPublished = a.publicationStatus === "PUBLISHED";
  const bPublished = b.publicationStatus === "PUBLISHED";

  // Two published affairs: never automatic, whatever the confidence. Merging
  // them deletes a page a reader can reach today.
  if (aPublished && bPublished) {
    return {
      decision: "REVIEW_REQUIRED",
      reason: "Deux affaires publiées : la fusion retire une page publique",
    };
  }

  // One of each: absorption is directed, the published affair always survives.
  if (aPublished !== bPublished) {
    const published = aPublished ? a : b;
    const draft = aPublished ? b : a;

    if (!confident) {
      return {
        decision: "REVIEW_REQUIRED",
        reason: `Rapprochement non concluant (${confidence}) face à une affaire publiée`,
      };
    }
    if (!isDeterministicMatch(matchedBy)) {
      return {
        decision: "REVIEW_REQUIRED",
        reason: `Rapprochement heuristique (${matchedBy}) : pas d'identifiant judiciaire commun`,
      };
    }
    if (unpropagatable.length > 0) {
      return {
        decision: "REVIEW_REQUIRED",
        reason: `Le brouillon affirme autre chose sur : ${unpropagatable.join(", ")}`,
      };
    }
    // A human already validated this draft; deciding it is a duplicate is theirs.
    if (draft.verifiedAt !== null) {
      return {
        decision: "REVIEW_REQUIRED",
        reason: "Le brouillon a déjà été validé par une relecture humaine",
      };
    }

    return {
      decision: "AUTO_ABSORB_DRAFT_INTO_PUBLISHED",
      keepId: published.id,
      removeId: draft.id,
      reason: `Identifiant judiciaire commun (${matchedBy}) : le brouillon est absorbé par l'affaire publiée`,
    };
  }

  // Two drafts: nothing public is at stake.
  if (!confident) {
    return {
      decision: "REVIEW_REQUIRED",
      reason: `Rapprochement non concluant (${confidence})`,
    };
  }

  const [keep, remove] = pickDraftSurvivor(a, b);
  if (remove.verifiedAt !== null) {
    return {
      decision: "REVIEW_REQUIRED",
      reason: "Le brouillon à absorber a déjà été validé par une relecture humaine",
    };
  }

  return {
    decision: "AUTO_MERGE_DRAFTS",
    keepId: keep.id,
    removeId: remove.id,
    reason: `Deux brouillons rapprochés en ${confidence} (${matchedBy})`,
  };
}
