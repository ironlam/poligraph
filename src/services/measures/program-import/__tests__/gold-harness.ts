import { getNormalizationGroundingFailure } from "../extractor";
import { isHistoricalStatement } from "../policy";
import type { AcceptanceGuard } from "../policy";
import type { ExtractedProposal } from "../types";

export type GoldExpectedEntry = {
  id: string;
  sourceText: string;
  expectedClassification: ExtractedProposal["classification"];
  documentUrl: string;
  page: number;
  historical?: boolean;
};

export type GoldObservedProposal = Pick<
  ExtractedProposal,
  "sourceText" | "normalizedText" | "classification" | "theme" | "confidence" | "rationale" | "page"
> & {
  documentUrl: string;
  accepted: boolean;
  modelClassification?: ExtractedProposal["modelClassification"];
  extractionGuard?: ExtractedProposal["extractionGuard"];
  normalizationFallback?: ExtractedProposal["normalizationFallback"];
  historicalContext?: boolean;
  acceptanceGuard?: AcceptanceGuard | null;
};

export type GoldAbsenceCause =
  | "PARSER_OR_SEGMENTATION"
  | "EXTRACTION_OMISSION"
  | "GOLD_MATCHING_FAILURE"
  | "UNDETERMINED";

export type GoldMatcher = "LEGACY_MAX_TOKEN_OVERLAP" | "PAGE_CITATION_COVERAGE";

export type GoldEvaluationRow = {
  id: string;
  expectedClassification: ExtractedProposal["classification"];
  documentUrl: string;
  page: number;
  detected: boolean;
  actualClassification: ExtractedProposal["classification"] | null;
  accepted: boolean;
  classificationCorrect: boolean;
  absenceCause: GoldAbsenceCause | null;
  rejectionGuard: string | null;
};

type Match = {
  proposal: GoldObservedProposal;
  overlap: number;
  goldCoverage: number;
};

const ACTION_CLASSIFICATIONS = new Set<ExtractedProposal["classification"]>([
  "MEASURE",
  "OBJECTIVE",
]);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .normalize("NFKD")
      .replace(/\p{Diacritic}/gu, "")
      .toLocaleLowerCase("fr")
      .match(/[a-z0-9]+/g) ?? []
  );
}

function citationScores(expected: string, observed: string) {
  const expectedTokens = tokens(expected);
  const observedTokens = tokens(observed);
  const shared = [...expectedTokens].filter((token) => observedTokens.has(token)).length;
  return {
    shared,
    overlap: shared / Math.max(expectedTokens.size, observedTokens.size, 1),
    goldCoverage: shared / Math.max(expectedTokens.size, 1),
  };
}

function bestMatch(
  entry: GoldExpectedEntry,
  proposals: GoldObservedProposal[],
  matcher: GoldMatcher
): Match | null {
  const candidates = proposals
    .filter(
      (proposal) =>
        proposal.documentUrl === entry.documentUrl &&
        (matcher === "LEGACY_MAX_TOKEN_OVERLAP" || proposal.page === entry.page)
    )
    .map((proposal) => ({ proposal, ...citationScores(entry.sourceText, proposal.sourceText) }))
    .filter((candidate) =>
      matcher === "LEGACY_MAX_TOKEN_OVERLAP"
        ? candidate.overlap >= 0.55
        : candidate.overlap >= 0.55 || (candidate.shared >= 4 && candidate.goldCoverage >= 0.65)
    )
    .sort((left, right) =>
      matcher === "LEGACY_MAX_TOKEN_OVERLAP"
        ? right.overlap - left.overlap
        : right.goldCoverage - left.goldCoverage || right.overlap - left.overlap
    );
  return candidates[0] ?? null;
}

function hasAcceptedSafetyMatch(
  entry: GoldExpectedEntry,
  proposals: GoldObservedProposal[]
): boolean {
  const strictMatch = bestMatch(entry, proposals, "PAGE_CITATION_COVERAGE");
  if (!entry.historical) return strictMatch?.proposal.accepted ?? false;

  // Historical citations are sometimes shortened to the title of an old bill. Keep the looser
  // safety net only for entries explicitly annotated historical, where missing one is riskier
  // than confusing it with a neighboring current proposal.
  return proposals.some((proposal) => {
    if (
      !proposal.accepted ||
      proposal.documentUrl !== entry.documentUrl ||
      proposal.page !== entry.page
    ) {
      return false;
    }
    const score = citationScores(entry.sourceText, proposal.sourceText);
    return score.shared >= 5 && (score.goldCoverage >= 0.45 || score.overlap >= 0.45);
  });
}

export function getProposalRejectionGuard(proposal: GoldObservedProposal): string | null {
  if (proposal.accepted) return null;
  if (proposal.extractionGuard) return proposal.extractionGuard;
  if (proposal.acceptanceGuard) return proposal.acceptanceGuard;
  const explicitGuard = proposal.rationale.match(
    /NUMBER_ADDED|PERCENTAGE_ADDED|CURRENCY_ADDED|PROPER_NAME_ADDED|PRECISE_CONTENT_ADDED/
  )?.[0];
  if (explicitGuard) return explicitGuard;
  if (/Thème hors nomenclature/.test(proposal.rationale)) return "INVALID_THEME";
  if (/Citation introuvable/.test(proposal.rationale)) return "UNGROUNDED_SOURCE_TEXT";
  if (proposal.historicalContext || isHistoricalStatement(proposal.sourceText)) {
    return "HISTORICAL_REFERENCE";
  }
  if (!ACTION_CLASSIFICATIONS.has(proposal.classification)) return "NON_ACTION_CLASSIFICATION";
  if (proposal.theme === null) return "MISSING_THEME";
  if (proposal.normalizedText === null) return "MISSING_NORMALIZED_TEXT";
  if (proposal.confidence < 0.75) return "LOW_CONFIDENCE";
  return "UNDETERMINED_GUARD";
}

export function evaluateGoldSet(args: {
  gold: GoldExpectedEntry[];
  proposals: GoldObservedProposal[];
  matcher: GoldMatcher;
  demonstratedAbsenceCauses?: Partial<Record<string, GoldAbsenceCause>>;
}) {
  const rows: GoldEvaluationRow[] = args.gold.map((entry) => {
    const match = bestMatch(entry, args.proposals, args.matcher);
    const legacyMatch = bestMatch(entry, args.proposals, "LEGACY_MAX_TOKEN_OVERLAP");
    const citationMatch = bestMatch(entry, args.proposals, "PAGE_CITATION_COVERAGE");
    const absenceCause = match
      ? null
      : !legacyMatch && citationMatch
        ? "GOLD_MATCHING_FAILURE"
        : (args.demonstratedAbsenceCauses?.[entry.id] ?? "UNDETERMINED");
    return {
      id: entry.id,
      expectedClassification: entry.expectedClassification,
      documentUrl: entry.documentUrl,
      page: entry.page,
      detected: match !== null,
      actualClassification: match?.proposal.classification ?? null,
      accepted: match?.proposal.accepted ?? false,
      classificationCorrect: match?.proposal.classification === entry.expectedClassification,
      absenceCause,
      rejectionGuard: match ? getProposalRejectionGuard(match.proposal) : null,
    };
  });

  const confusion: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    const actual = row.actualClassification ?? "NOT_DETECTED";
    confusion[row.expectedClassification] ??= {};
    const expectedBucket = confusion[row.expectedClassification]!;
    expectedBucket[actual] = (expectedBucket[actual] ?? 0) + 1;
  }

  const actionRows = rows.filter((row) => ACTION_CLASSIFICATIONS.has(row.expectedClassification));
  const historicalIds = new Set(
    args.gold.filter((entry) => entry.historical).map((entry) => entry.id)
  );

  return {
    rows,
    metrics: {
      detected: rows.filter((row) => row.detected).length,
      measuresDetected: rows.filter(
        (row) => row.expectedClassification === "MEASURE" && row.detected
      ).length,
      objectivesDetected: rows.filter(
        (row) => row.expectedClassification === "OBJECTIVE" && row.detected
      ).length,
      correctlyClassified: rows.filter((row) => row.classificationCorrect).length,
      actionsAccepted: actionRows.filter((row) => row.accepted).length,
      correctlyClassifiedActionsAccepted: actionRows.filter(
        (row) => row.classificationCorrect && row.accepted
      ).length,
      nonActionsAccepted: args.gold.filter(
        (entry) =>
          !ACTION_CLASSIFICATIONS.has(entry.expectedClassification) &&
          hasAcceptedSafetyMatch(entry, args.proposals)
      ).length,
      historicalAccepted: args.gold.filter(
        (entry) => historicalIds.has(entry.id) && hasAcceptedSafetyMatch(entry, args.proposals)
      ).length,
      confusion,
    },
  };
}

export function summarizeRejectedProposalGuards(proposals: GoldObservedProposal[]) {
  const guards: Record<string, number> = {};
  const normalizationFallbacks: Record<string, number> = {};
  let preciseInformationAdded = 0;
  for (const proposal of proposals) {
    if (proposal.normalizationFallback) {
      normalizationFallbacks[proposal.normalizationFallback] =
        (normalizationFallbacks[proposal.normalizationFallback] ?? 0) + 1;
    }
    if (proposal.normalizedText) {
      preciseInformationAdded += Number(
        getNormalizationGroundingFailure(proposal.sourceText, proposal.normalizedText) !== null
      );
    }
    const guard = getProposalRejectionGuard(proposal);
    if (guard) guards[guard] = (guards[guard] ?? 0) + 1;
  }
  return { guards, normalizationFallbacks, preciseInformationAdded };
}
