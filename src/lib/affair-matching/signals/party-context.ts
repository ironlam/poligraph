import {
  AffairSignalEvaluator,
  AffairSignalResult,
  AffairSignalTier,
  AffairScoringInput,
  AffairCandidateRecord,
  AffairSignalContext,
} from "./types";
import { PARTY_MATCH_LLR, PARTY_FORMER_MATCH_LLR, PARTY_MISMATCH_LLR } from "./constants";

/**
 * French party acronyms commonly seen in press text. Order matters for
 * longest-match extraction so that "LFI" is not swallowed by "LR".
 */
const PARTY_ACRONYMS = [
  "LREM",
  "MODEM",
  "HORIZONS",
  "RENAISSANCE",
  "EELV",
  "LFI",
  "RN",
  "FN",
  "LR",
  "UMP",
  "UDI",
  "PS",
  "PCF",
  "PRG",
];

function extractPartyMentions(text: string): Set<string> {
  const found = new Set<string>();
  for (const acronym of PARTY_ACRONYMS) {
    const re = new RegExp(`\\b${acronym}\\b`, "i");
    if (re.test(text)) found.add(acronym.toUpperCase());
  }
  return found;
}

/**
 * Checks whether political parties mentioned in the text align with the
 * candidate's party history. Requires the text to mention a party at all,
 * otherwise neutral.
 */
export class PartyContextSignal implements AffairSignalEvaluator {
  readonly id = "party-context";
  readonly description = "Political party consistency between text and candidate history";
  readonly tier = AffairSignalTier.MODERATE;

  evaluate(
    input: AffairScoringInput,
    candidate: AffairCandidateRecord,
    _context: AffairSignalContext
  ): AffairSignalResult {
    const mentions = extractPartyMentions(input.text);
    if (mentions.size === 0) {
      return {
        signalId: this.id,
        logLikelihoodRatio: 0,
        explanation: "No party acronym in text",
      };
    }

    if (candidate.parties.length === 0) {
      return {
        signalId: this.id,
        logLikelihoodRatio: 0,
        explanation: "Candidate has no party history",
      };
    }

    const currentLabels = new Set(
      candidate.parties.filter((p) => p.current).map((p) => p.partyLabel.toUpperCase())
    );
    const formerLabels = new Set(
      candidate.parties.filter((p) => !p.current).map((p) => p.partyLabel.toUpperCase())
    );

    for (const mention of mentions) {
      if (currentLabels.has(mention)) {
        return {
          signalId: this.id,
          logLikelihoodRatio: PARTY_MATCH_LLR,
          explanation: `Current party match: ${mention}`,
          evidence: { matchType: "CURRENT", mention },
        };
      }
    }

    for (const mention of mentions) {
      if (formerLabels.has(mention)) {
        return {
          signalId: this.id,
          logLikelihoodRatio: PARTY_FORMER_MATCH_LLR,
          explanation: `Former party match: ${mention}`,
          evidence: { matchType: "FORMER", mention },
        };
      }
    }

    return {
      signalId: this.id,
      logLikelihoodRatio: PARTY_MISMATCH_LLR,
      explanation: `Party mismatch: text has [${[...mentions].join(",")}], candidate has [${[...currentLabels, ...formerLabels].join(",")}]`,
      evidence: { matchType: "MISMATCH" },
    };
  }
}
