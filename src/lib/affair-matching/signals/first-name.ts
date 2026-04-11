import {
  AffairSignalEvaluator,
  AffairSignalResult,
  AffairSignalTier,
  AffairScoringInput,
  AffairCandidateRecord,
  AffairSignalContext,
} from "./types";
import {
  FIRST_NAME_NEAR_LLR,
  FIRST_NAME_ABSENT_LLR,
  FIRST_NAME_PROXIMITY_CHARS,
} from "./constants";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function wordIndex(text: string, word: string): number {
  const re = new RegExp(`(?:^|[^a-zA-ZÀ-ÿ])${word}(?=[^a-zA-ZÀ-ÿ]|$)`, "i");
  const match = text.match(re);
  return match?.index ?? -1;
}

/**
 * Boosts name-quality when the candidate's first name appears close to
 * the surname in the text. Resolves SURNAME_ONLY ambiguity by converting
 * it into a stronger proximity signal.
 */
export class FirstNameSignal implements AffairSignalEvaluator {
  readonly id = "first-name";
  readonly description = "First name presence near the surname";
  readonly tier = AffairSignalTier.MODERATE;

  evaluate(
    input: AffairScoringInput,
    candidate: AffairCandidateRecord,
    _context: AffairSignalContext
  ): AffairSignalResult {
    if (!candidate.firstName || candidate.firstName.length < 2) {
      return {
        signalId: this.id,
        logLikelihoodRatio: 0,
        explanation: "No first name on candidate",
      };
    }

    const normalizedText = normalize(input.text);
    const normalizedFirst = normalize(candidate.firstName);
    const normalizedLast = normalize(candidate.lastName);

    const firstIdx = wordIndex(normalizedText, normalizedFirst);
    const lastIdx = wordIndex(normalizedText, normalizedLast);

    if (firstIdx < 0) {
      return {
        signalId: this.id,
        logLikelihoodRatio: FIRST_NAME_ABSENT_LLR,
        explanation: `First name "${candidate.firstName}" not in text`,
      };
    }

    if (lastIdx >= 0 && Math.abs(firstIdx - lastIdx) <= FIRST_NAME_PROXIMITY_CHARS) {
      return {
        signalId: this.id,
        logLikelihoodRatio: FIRST_NAME_NEAR_LLR,
        explanation: `First name within ${FIRST_NAME_PROXIMITY_CHARS} chars of surname`,
        evidence: { gap: Math.abs(firstIdx - lastIdx) },
      };
    }

    return {
      signalId: this.id,
      logLikelihoodRatio: 0,
      explanation: "First name present but far from surname",
    };
  }
}
