import {
  AffairSignalEvaluator,
  AffairSignalResult,
  AffairSignalTier,
  AffairScoringInput,
  AffairCandidateRecord,
  AffairSignalContext,
} from "./types";
import { FRENCH_ANCHOR_LLR, FOREIGN_CONTEXT_PENALTY_LLR } from "./constants";
import {
  FRENCH_ANCHORS,
  FRENCH_PARTY_ANCHORS,
  FOREIGN_INDICATORS,
} from "@/config/judicial-anchors";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const FRENCH_ANCHOR_SET = [
  ...FRENCH_ANCHORS.map(normalize),
  ...FRENCH_PARTY_ANCHORS.map((a) => a.toLowerCase()),
];
const FOREIGN_INDICATOR_SET = FOREIGN_INDICATORS.map(normalize);

function containsAny(text: string, patterns: string[]): string | null {
  for (const pattern of patterns) {
    // Use word-boundary regex for party acronyms (short), substring for phrases.
    if (pattern.length <= 6) {
      const re = new RegExp(`\\b${pattern}\\b`, "i");
      if (re.test(text)) return pattern;
    } else if (text.includes(pattern)) {
      return pattern;
    }
  }
  return null;
}

/**
 * Detects whether the text is plausibly about French politics or about
 * foreign affairs. Protects against linking foreign politicians to French
 * candidates by applying a large negative score when foreign context
 * dominates with no French anchor present.
 */
export class ContextPlausibilitySignal implements AffairSignalEvaluator {
  readonly id = "context-plausibility";
  readonly description = "French anchors vs foreign context indicators";
  readonly tier = AffairSignalTier.CONTEXTUAL;

  evaluate(
    input: AffairScoringInput,
    _candidate: AffairCandidateRecord,
    _context: AffairSignalContext
  ): AffairSignalResult {
    const text = normalize(input.text);

    const french = containsAny(text, FRENCH_ANCHOR_SET);
    const foreign = containsAny(text, FOREIGN_INDICATOR_SET);

    if (french && !foreign) {
      return {
        signalId: this.id,
        logLikelihoodRatio: FRENCH_ANCHOR_LLR,
        explanation: `French anchor "${french}" detected, no foreign indicator`,
        evidence: { anchor: french },
      };
    }

    if (foreign && !french) {
      return {
        signalId: this.id,
        logLikelihoodRatio: FOREIGN_CONTEXT_PENALTY_LLR,
        explanation: `Foreign indicator "${foreign}" dominates with no French anchor`,
        evidence: { indicator: foreign },
      };
    }

    return {
      signalId: this.id,
      logLikelihoodRatio: 0,
      explanation: french && foreign ? "Mixed French and foreign context" : "No context signal",
    };
  }
}
