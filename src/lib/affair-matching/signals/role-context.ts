import {
  AffairSignalEvaluator,
  AffairSignalResult,
  AffairSignalTier,
  AffairScoringInput,
  AffairCandidateRecord,
  AffairSignalContext,
} from "./types";
import { ROLE_LOCATION_MATCH_LLR, ROLE_GENERIC_MATCH_LLR, ROLE_MISMATCH_LLR } from "./constants";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Maps a French role keyword to the Prisma MandateType enum values it matches.
 */
const ROLE_TOKENS: Record<string, string[]> = {
  maire: ["MAIRE"],
  depute: ["DEPUTE"],
  senateur: ["SENATEUR"],
  ministre: ["MINISTER", "MINISTRE"],
  president: ["PRESIDENT_REPUBLIQUE", "PRESIDENT_REGION", "PRESIDENT_DEPARTEMENT"],
  eurodepute: ["EURODEPUTE", "MEP"],
  conseiller: ["CONSEILLER_REGIONAL", "CONSEILLER_DEPARTEMENTAL", "CONSEILLER_MUNICIPAL"],
};

/** Reverse mapping: mandate type → set of role tokens that match it. */
const MANDATE_TO_TOKENS: Record<string, Set<string>> = (() => {
  const result: Record<string, Set<string>> = {};
  for (const [token, mandates] of Object.entries(ROLE_TOKENS)) {
    for (const mandate of mandates) {
      if (!result[mandate]) result[mandate] = new Set();
      result[mandate].add(token);
    }
  }
  return result;
})();

/**
 * Extracts mentioned roles from the affair text and compares them with the
 * candidate's mandate types. If a role carries a location ("maire de Lyon"),
 * we require the location to match the mandate location for the strongest score.
 */
export class RoleContextSignal implements AffairSignalEvaluator {
  readonly id = "role-context";
  readonly description = "Mentioned role and location vs candidate mandates";
  readonly tier = AffairSignalTier.STRONG;

  evaluate(
    input: AffairScoringInput,
    candidate: AffairCandidateRecord,
    _context: AffairSignalContext
  ): AffairSignalResult {
    if (candidate.mandates.length === 0) {
      return {
        signalId: this.id,
        logLikelihoodRatio: 0,
        explanation: "Candidate has no mandates to match against",
      };
    }

    const text = normalize(input.text);

    // Find role + location pattern, e.g., "maire de Lyon", "député du Nord".
    const roleLocationRe =
      /\b(maire|depute|senateur|conseiller|president)\s+(?:de|du|d'|des)\s+([a-z\-\s]{2,30})/i;
    const loc = text.match(roleLocationRe);
    if (loc && loc[1] && loc[2]) {
      const token = loc[1].toLowerCase();
      // Split on punctuation to avoid capturing trailing words after the location.
      const locationFragment = (loc[2].split(/[,.\s]{2,}/)[0] ?? loc[2]).trim();
      const mandateTypes = ROLE_TOKENS[token] ?? [];
      for (const mandate of candidate.mandates) {
        if (
          mandateTypes.includes(mandate.type) &&
          mandate.location &&
          (normalize(mandate.location).includes(locationFragment) ||
            locationFragment.includes(normalize(mandate.location)))
        ) {
          return {
            signalId: this.id,
            logLikelihoodRatio: ROLE_LOCATION_MATCH_LLR,
            explanation: `Role+location "${loc[0]}" matches ${mandate.type} of ${mandate.location}`,
            evidence: { matchType: "ROLE_LOCATION", mandateType: mandate.type },
          };
        }
      }
    }

    // Generic role match: any role token in text that matches any mandate type.
    const mentionedTokens = new Set<string>();
    for (const token of Object.keys(ROLE_TOKENS)) {
      if (new RegExp(`\\b${token}\\b`).test(text)) {
        mentionedTokens.add(token);
      }
    }
    if (mentionedTokens.size === 0) {
      return {
        signalId: this.id,
        logLikelihoodRatio: 0,
        explanation: "No role mentioned in text",
      };
    }

    const candidateTokens = new Set<string>();
    for (const mandate of candidate.mandates) {
      const tokens = MANDATE_TO_TOKENS[mandate.type];
      if (tokens) for (const t of tokens) candidateTokens.add(t);
    }

    // Any overlap = generic match.
    for (const t of mentionedTokens) {
      if (candidateTokens.has(t)) {
        return {
          signalId: this.id,
          logLikelihoodRatio: ROLE_GENERIC_MATCH_LLR,
          explanation: `Generic role match on "${t}"`,
          evidence: { matchType: "GENERIC", token: t },
        };
      }
    }

    // Mismatch: text mentions a role that candidate doesn't hold.
    return {
      signalId: this.id,
      logLikelihoodRatio: ROLE_MISMATCH_LLR,
      explanation: `Role mismatch: text mentions [${[...mentionedTokens].join(",")}] but candidate has [${[...candidateTokens].join(",")}]`,
      evidence: { matchType: "MISMATCH" },
    };
  }
}
