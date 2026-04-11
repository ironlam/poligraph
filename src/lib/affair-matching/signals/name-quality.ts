import {
  AffairSignalEvaluator,
  AffairSignalResult,
  AffairSignalTier,
  AffairScoringInput,
  AffairCandidateRecord,
  AffairSignalContext,
} from "./types";
import {
  NAME_FULL_EXACT_LLR,
  NAME_LEGAL_TITLE_SURNAME_LLR,
  NAME_SURNAME_PROXIMITY_LLR,
  NAME_SURNAME_ONLY_LLR,
  MIN_SURNAME_LENGTH,
  FIRST_NAME_PROXIMITY_CHARS,
} from "./constants";

/**
 * Normalizes text for case- and accent-insensitive matching.
 * Keeps word characters, spaces, hyphens, and apostrophes.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .trim();
}

/**
 * Legal titles that indicate the following word is a surname in French
 * judicial / press context. Written in unaccented form because the text
 * is normalized before matching.
 *
 * Note: no trailing \b — titles like "m." end with a non-word char (dot),
 * so \b between "." and " " never fires. The combined pattern uses \s+ as
 * the right delimiter instead.
 */
const LEGAL_TITLE_RE =
  /\b(?:m\.|mme\.?|mlle\.?|monsieur|madame|sieur|dame|prevenu(?:e)?|condamne(?:e)?|accuse(?:e)?|mis(?:e)? en examen)\s+/i;

/** Word-boundary regex helper that respects accented characters. */
function wordBoundary(word: string): RegExp {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-zA-Z\xC0-\xFF])${escaped}(?=[^a-zA-Z\xC0-\xFF]|$)`, "i");
}

/**
 * Determines how strongly the candidate's name appears in the affair text.
 * Migrated from src/services/sync/judilibre-scoring.ts::detectNameQuality
 * and extended with explicit log-LR values.
 */
export class NameQualitySignal implements AffairSignalEvaluator {
  readonly id = "name-quality";
  readonly description = "Candidate name presence in the affair text";
  readonly tier = AffairSignalTier.STRONG;

  evaluate(
    input: AffairScoringInput,
    candidate: AffairCandidateRecord,
    _context: AffairSignalContext
  ): AffairSignalResult {
    if (candidate.lastName.length < MIN_SURNAME_LENGTH) {
      return {
        signalId: this.id,
        logLikelihoodRatio: 0,
        disqualified: { reason: "surname too short for reliable matching" },
        explanation: `Surname "${candidate.lastName}" below minimum length`,
      };
    }

    const normalizedText = normalize(input.text);
    const normalizedLast = normalize(candidate.lastName);
    const normalizedFirst = normalize(candidate.firstName);
    const normalizedFull = normalize(candidate.fullName);

    // Last name must be present as a word, else disqualify.
    if (!wordBoundary(normalizedLast).test(normalizedText)) {
      return {
        signalId: this.id,
        logLikelihoodRatio: 0,
        disqualified: { reason: "surname not present in text" },
        explanation: `Surname "${candidate.lastName}" not found`,
      };
    }

    // 1. Full name exact match.
    if (wordBoundary(normalizedFull).test(normalizedText)) {
      return {
        signalId: this.id,
        logLikelihoodRatio: NAME_FULL_EXACT_LLR,
        explanation: `Full name "${candidate.fullName}" found`,
        evidence: { matchType: "FULL_EXACT" },
      };
    }

    // 2. Legal title followed by surname, e.g., "M. Dupont".
    // LEGAL_TITLE_RE already includes a trailing \s+ so we append the surname directly.
    const legalTitleBefore = new RegExp(`${LEGAL_TITLE_RE.source}${normalizedLast}`, "i");
    if (legalTitleBefore.test(normalizedText)) {
      return {
        signalId: this.id,
        logLikelihoodRatio: NAME_LEGAL_TITLE_SURNAME_LLR,
        explanation: `Legal title + surname "${candidate.lastName}" found`,
        evidence: { matchType: "LEGAL_TITLE_SURNAME" },
      };
    }

    // 3. First name and last name within proximity window.
    if (normalizedFirst.length >= 2) {
      const firstIdx = normalizedText.search(wordBoundary(normalizedFirst));
      const lastIdx = normalizedText.search(wordBoundary(normalizedLast));
      if (
        firstIdx >= 0 &&
        lastIdx >= 0 &&
        Math.abs(firstIdx - lastIdx) <= FIRST_NAME_PROXIMITY_CHARS
      ) {
        return {
          signalId: this.id,
          logLikelihoodRatio: NAME_SURNAME_PROXIMITY_LLR,
          explanation: `First name and surname within ${FIRST_NAME_PROXIMITY_CHARS} chars`,
          evidence: { matchType: "PROXIMITY" },
        };
      }
    }

    // 4. Surname only. Weakest positive, vulnerable to common-word false positives.
    return {
      signalId: this.id,
      logLikelihoodRatio: NAME_SURNAME_ONLY_LLR,
      explanation: `Surname only "${candidate.lastName}" found`,
      evidence: { matchType: "SURNAME_ONLY" },
    };
  }
}
