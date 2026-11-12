import {
  CERTAINTY_DESCRIPTIONS,
  CERTAINTY_LABELS,
  getAttributedCertaintyLevel,
  type CertaintyLevel,
} from "@/config/certainty";
import { AFFAIR_CATEGORY_LABELS, getAffairStatusLabel } from "@/config/labels";
import type {
  AffairCategory,
  AffairStatus,
  Involvement,
  JurisdictionOrder,
} from "@/generated/prisma";

/** What the share card of an affair prints. Built here, drawn in `src/components/share`. */
export interface AffairCardInput {
  certainty: CertaintyLevel;
  /** The certainty level in words: the headline of the card. */
  certaintyLabel: string;
  /** The precise step of the procedure, null when it says nothing more than the level. */
  stepLabel: string | null;
  title: string;
  /** How the person stands in this procedure today, in words. */
  roleLabel: string;
  fullName: string;
  /** Party at the time of the facts. Null when it is not established: never the current one. */
  partyAtTime: string | null;
  /** The site's own wording for this level, presumption of innocence included. */
  notice: string;
  sentence: string | null;
  categoryLabel: string;
  sourceCount: number;
}

const ROLE_LABELS: Record<CertaintyLevel, string> = {
  ETABLI: "Personne condamnée",
  PRONONCE: "Personne condamnée, décision non définitive",
  EN_COURS: "Personne mise en cause",
  CLOS_SANS_CHARGE: "Personne qui était visée par l'instruction",
  CLOS_FAVORABLE: "Personne qui était mise en cause",
};

/** A sentence exists only once a court has pronounced one. */
const LEVELS_WITH_SENTENCE: ReadonlySet<CertaintyLevel> = new Set(["ETABLI", "PRONONCE"]);

/**
 * The share card of an affair, or null when there must be none.
 *
 * An image puts a name beside a judicial status and travels without the page around it, so it is
 * held to a stricter rule than the page:
 *
 * - Only for the person the procedure targets, in a penal procedure. A witness, a plaintiff, a
 *   victim or someone merely mentioned gets no card: the status would be read as theirs (#383).
 *   This is `getAttributedCertaintyLevel`, the same guard as the certainty badge.
 * - Only with at least one source to count.
 * - The words on justice are the site's own (`CERTAINTY_LABELS`, `CERTAINTY_DESCRIPTIONS`), which
 *   carry the presumption of innocence wherever it applies. Nothing is rephrased for the card.
 * - The party is the one at the time of the facts or nothing: the current party of a person may
 *   not have existed then.
 * - No court and no verdict date: on the base, a quarter of `Affair.court` values name a body
 *   that renders no decision (see `decision-fields.ts`). The fiche shows them with their context.
 */
export function buildAffairShareCard(affair: {
  involvement: Involvement;
  status: AffairStatus;
  jurisdictionOrder: JurisdictionOrder;
  category: AffairCategory;
  title: string;
  sentence: string | null;
  fullName: string;
  partyAtTime: string | null;
  sourceCount: number;
}): AffairCardInput | null {
  const certainty = getAttributedCertaintyLevel(affair);
  if (certainty === null || affair.sourceCount <= 0) return null;

  const certaintyLabel = CERTAINTY_LABELS[certainty];
  const step = getAffairStatusLabel(affair.status, affair.jurisdictionOrder);
  const sentence = affair.sentence?.trim() || null;

  return {
    certainty,
    certaintyLabel,
    stepLabel: step === certaintyLabel ? null : step,
    title: affair.title,
    roleLabel: ROLE_LABELS[certainty],
    fullName: affair.fullName,
    partyAtTime: affair.partyAtTime,
    notice: CERTAINTY_DESCRIPTIONS[certainty],
    sentence: LEVELS_WITH_SENTENCE.has(certainty) ? sentence : null,
    categoryLabel: AFFAIR_CATEGORY_LABELS[affair.category],
    sourceCount: affair.sourceCount,
  };
}
