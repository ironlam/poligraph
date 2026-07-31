/**
 * Sole authority on how a prison or ineligibility term splits between a firm part and a
 * suspended one (#576).
 *
 * The column it replaces was a nullable boolean, which had to carry three facts about the
 * sentence (fully suspended, fully firm, mixed) plus one fact about our own knowledge
 * (not established). Every one of its six read sites sent the null case to the accusatory
 * branch, because `!x` and `x ? a : b` always do. One published fiche tripled the firm
 * term of a named person that way.
 *
 * Centralised on purpose: the point of removing the boolean is that no future ternary
 * gets to make that choice again.
 */

/** Perpetuity sentinel carried by `Affair.prisonMonths` (see discover-affairs). */
export const LIFE_SENTENCE_MONTHS = 9999;

export type SentenceSplit =
  | { kind: "NONE" }
  | { kind: "LIFE" }
  | { kind: "UNKNOWN"; totalMonths: number }
  | { kind: "FULLY_SUSPENDED"; totalMonths: number }
  | { kind: "FULLY_FIRM"; totalMonths: number }
  | { kind: "MIXED"; totalMonths: number; firmMonths: number; suspendedMonths: number }
  | { kind: "INVALID"; totalMonths: number | null; firmMonths: number | null };

export function classifySentenceSplit(
  totalMonths: number | null,
  firmMonths: number | null
): SentenceSplit {
  // No term pronounced. A firm part here would assert a sentence nobody recorded, but a
  // zero one states nothing, so only a positive value is an error.
  if (totalMonths == null || totalMonths === 0) {
    return firmMonths == null || firmMonths === 0
      ? { kind: "NONE" }
      : { kind: "INVALID", totalMonths, firmMonths };
  }

  // French law does not suspend a life term, so any firm part on one is a data error
  // rather than a split to render.
  if (totalMonths === LIFE_SENTENCE_MONTHS) {
    return firmMonths == null ? { kind: "LIFE" } : { kind: "INVALID", totalMonths, firmMonths };
  }

  if (firmMonths == null) return { kind: "UNKNOWN", totalMonths };
  if (firmMonths < 0 || firmMonths > totalMonths) {
    return { kind: "INVALID", totalMonths, firmMonths };
  }
  if (firmMonths === 0) return { kind: "FULLY_SUSPENDED", totalMonths };
  if (firmMonths === totalMonths) return { kind: "FULLY_FIRM", totalMonths };

  return {
    kind: "MIXED",
    totalMonths,
    firmMonths,
    suspendedMonths: totalMonths - firmMonths,
  };
}

/**
 * Whether the pair is representable at all. Used by the Zod schemas and by
 * `acceptProposal`, which is the only place that sees both the patch and the live row.
 */
export function isValidSentenceSplit(
  totalMonths: number | null,
  firmMonths: number | null
): boolean {
  return classifySentenceSplit(totalMonths, firmMonths).kind !== "INVALID";
}
