import {
  AffairSignalEvaluator,
  AffairSignalResult,
  AffairSignalTier,
  AffairScoringInput,
  AffairCandidateRecord,
  AffairSignalContext,
} from "./types";
import {
  JURISDICTION_EXACT_MATCH_LLR,
  JURISDICTION_DEPARTMENT_OVERLAP_LLR,
  JURISDICTION_MISMATCH_LLR,
} from "./constants";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Signals how well the affair's court or department overlaps with the
 * candidate politician's territories. Migrated from
 * src/services/sync/judilibre-scoring.ts::determineContextSignal
 * and reframed as log-LR rather than a matrix lookup.
 */
export class JurisdictionSignal implements AffairSignalEvaluator {
  readonly id = "jurisdiction";
  readonly description = "Court or department overlap with candidate mandates";
  readonly tier = AffairSignalTier.MODERATE;

  evaluate(
    input: AffairScoringInput,
    candidate: AffairCandidateRecord,
    _context: AffairSignalContext
  ): AffairSignalResult {
    const { court, department } = input.metadata;

    if (!court && !department) {
      return {
        signalId: this.id,
        logLikelihoodRatio: 0,
        explanation: "No jurisdiction data on input",
      };
    }

    // Court location exact match against mandate locations.
    if (court) {
      const normalizedCourt = normalize(court);
      for (const mandate of candidate.mandates) {
        if (mandate.location && normalizedCourt.includes(normalize(mandate.location))) {
          return {
            signalId: this.id,
            logLikelihoodRatio: JURISDICTION_EXACT_MATCH_LLR,
            explanation: `Court "${court}" matches mandate location "${mandate.location}"`,
            evidence: { matchType: "COURT_LOCATION", mandateType: mandate.type },
          };
        }
      }
    }

    // Department-level overlap.
    if (department) {
      if (candidate.departments.length === 0) {
        return {
          signalId: this.id,
          logLikelihoodRatio: 0,
          explanation: "Candidate has no department data (neutral)",
        };
      }
      if (candidate.departments.includes(department)) {
        return {
          signalId: this.id,
          logLikelihoodRatio: JURISDICTION_DEPARTMENT_OVERLAP_LLR,
          explanation: `Department ${department} overlaps candidate departments`,
          evidence: { matchType: "DEPARTMENT_OVERLAP" },
        };
      }
      return {
        signalId: this.id,
        logLikelihoodRatio: JURISDICTION_MISMATCH_LLR,
        explanation: `Department ${department} not in candidate departments [${candidate.departments.join(",")}]`,
        evidence: { matchType: "MISMATCH" },
      };
    }

    return {
      signalId: this.id,
      logLikelihoodRatio: 0,
      explanation: "Jurisdiction data present but no actionable match",
    };
  }
}
