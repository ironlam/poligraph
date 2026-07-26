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
 * retires a URL. So automation stops at the published boundary, full stop.
 *
 * It used to stop there *unless* a court-assigned identifier was shared. The first
 * real triage killed that exception (issue #525): two Carignon convictions share a
 * pourvoi number, the facts date, the verdict date and one cassation ruling, and
 * they are still two separate counts, so two affairs. A shared identifier means a
 * shared decision or proceeding, never a shared editorial affair. Nothing crosses
 * the published boundary without a person now.
 *
 * That fix stopped at the published boundary, and the reasoning does not (issue
 * #557). Two *drafts* sharing an ECLI were still merged automatically, although the
 * Carignon case says nothing about publication status: one decision carries several
 * counts, whatever the status of the fiches describing them. So automatic merging
 * now requires evidence drawn from the affairs' own editorial content, and a shared
 * decision identity sends the pair to a reader instead — see `classifyMatchEvidence`.
 */

import type { PublicationStatus, SourceType } from "@/generated/prisma";
import type { MatchConfidence } from "./matching";
import {
  classifyMatchEvidence,
  isOfficialJudicialIdentifierMatch,
} from "@/lib/affairs/match-evidence";

/** Statuses this lot handles. See the issue for ARCHIVED/EXCLUDED/REJECTED. */
const MERGEABLE_STATUSES: ReadonlySet<PublicationStatus> = new Set([
  "DRAFT",
  "PUBLISHED",
] as PublicationStatus[]);

/**
 * What the automatic planner may conclude.
 *
 * There is no automatic absorption into a published affair: that path exists as a
 * service (`absorbDraftIntoPublished`) but is only reachable from a confirmed
 * admin action, never from a cron (issue #525).
 */
export type MergeDecision = "AUTO_MERGE_DRAFTS" | "REVIEW_REQUIRED" | "NOT_ELIGIBLE";

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
   * write nor turn into a proposal.
   *
   * Informational since automation stopped crossing the published boundary: it is
   * shown to the reviewer rather than gating a decision. Draft merges keep their
   * previous behaviour and do not consult it.
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

  // One draft, one published: never automatic, whatever the evidence.
  //
  // A shared identifier is reported in the reason rather than acted on: it is the
  // strongest reason to *read* the pair, and the Carignon case is exactly why it
  // cannot be a reason to merge it.
  if (aPublished !== bPublished) {
    if (isOfficialJudicialIdentifierMatch(matchedBy)) {
      return {
        decision: "REVIEW_REQUIRED",
        reason: `Identifiant de décision commun (${matchedBy}) entre un brouillon et une affaire publiée : une même décision peut porter plusieurs chefs, donc plusieurs fiches`,
      };
    }
    return {
      decision: "REVIEW_REQUIRED",
      reason: `Brouillon rapproché d'une affaire publiée (${matchedBy}/${confidence}) : la fusion retire une page publique`,
    };
  }

  // Two drafts: nothing public is at stake, but a shared decision still is not a
  // shared affair. This check sits before the confidence one on purpose: CERTAIN on
  // an ECLI is exactly the case that used to merge, and the confidence was never the
  // problem — what the confidence rested on was.
  const evidence = classifyMatchEvidence(matchedBy);
  if (!evidence.editorialIdentityEvidence) {
    if (evidence.officialDecisionIdentity) {
      return {
        decision: "REVIEW_REQUIRED",
        reason: `Identité de décision commune (${matchedBy}) : une même décision peut porter plusieurs chefs, donc plusieurs fiches`,
      };
    }
    return {
      decision: "REVIEW_REQUIRED",
      reason: `Rapprochement sans preuve d'identité éditoriale (${matchedBy})`,
    };
  }

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
