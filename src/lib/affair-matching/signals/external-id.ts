import {
  AffairSignalEvaluator,
  AffairSignalResult,
  AffairSignalTier,
  AffairScoringInput,
  AffairCandidateRecord,
  AffairSignalContext,
} from "./types";
import { EXTERNAL_ID_MATCH_LLR } from "./constants";

/**
 * Fires when the affair already carries an external identifier (ECLI, pourvoi,
 * Wikidata Q-ID) that matches one of the candidate politician's external IDs.
 * This is the strongest positive signal and short-circuits to SAME.
 */
export class ExternalIdSignal implements AffairSignalEvaluator {
  readonly id = "external-id";
  readonly description = "External identifier cross-reference (ECLI, pourvoi, Wikidata)";
  readonly tier = AffairSignalTier.DETERMINISTIC;

  evaluate(
    input: AffairScoringInput,
    candidate: AffairCandidateRecord,
    _context: AffairSignalContext
  ): AffairSignalResult {
    const inputIds = input.metadata.externalIds;
    if (!inputIds) {
      return {
        signalId: this.id,
        logLikelihoodRatio: 0,
        explanation: "No external IDs on the input",
      };
    }

    // Map input key names to candidate.externalIds keys.
    const pairs: Array<[keyof NonNullable<typeof inputIds>, string]> = [
      ["ecli", "ecli"],
      ["pourvoiNumber", "pourvoi"],
      ["wikidataQId", "wikidata"],
    ];

    for (const [inputKey, candidateKey] of pairs) {
      const inputValue = inputIds[inputKey];
      const candidateValue = candidate.externalIds[candidateKey];
      if (inputValue && candidateValue && inputValue === candidateValue) {
        return {
          signalId: this.id,
          logLikelihoodRatio: EXTERNAL_ID_MATCH_LLR,
          explanation: `External ID match on ${candidateKey}: ${inputValue}`,
          evidence: { matchedKey: candidateKey, value: inputValue },
        };
      }
    }

    return {
      signalId: this.id,
      logLikelihoodRatio: 0,
      explanation: "No external ID match",
    };
  }
}
