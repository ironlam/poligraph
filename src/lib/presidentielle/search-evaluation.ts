import type {
  PresidentialSearchEvaluationCase,
  PresidentialSearchExpectation,
} from "@/config/presidential-search-evaluation";
import type { PresidentialCorpusSearchResult } from "@/services/presidentielle/corpus-search";
import type { PresidentialSearchStrategy } from "@/services/presidentielle/hybrid-search";

type RankedResult =
  | { kind: "theme"; theme: string; label: string }
  | { kind: "candidacy"; name: string }
  | { kind: "measure"; text: string; candidateName: string; theme: string };

export type PresidentialSearchCaseEvaluation = {
  id: string;
  category: PresidentialSearchEvaluationCase["category"];
  query: string;
  latencyMs: number;
  total: number;
  returned: number;
  relevantInTopK: number;
  recallAtK: number | null;
  precisionAtK: number | null;
  passed: boolean;
  expectations: PresidentialSearchExpectation[];
  topResults: RankedResult[];
  semanticMaxSimilarity: number | null;
};

export type PresidentialSearchEvaluationReport = {
  generatedAt: string;
  electionSlug: string;
  strategy: PresidentialSearchStrategy;
  topK: number;
  queryCount: number;
  metrics: {
    recallAtK: number;
    precisionAtK: number;
    zeroResultRate: number;
    negativeFalsePositiveRate: number;
    latencyP50Ms: number;
    latencyP95Ms: number;
  };
  cases: PresidentialSearchCaseEvaluation[];
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .trim();
}

function flatten(result: PresidentialCorpusSearchResult): RankedResult[] {
  return [
    ...result.subjects.map((subject) => ({
      kind: "theme" as const,
      theme: subject.theme,
      label: subject.label,
    })),
    ...result.candidacies.map((candidate) => ({
      kind: "candidacy" as const,
      name: candidate.name,
    })),
    ...result.measures.map((measure) => ({
      kind: "measure" as const,
      text: measure.text,
      candidateName: measure.candidateName,
      theme: measure.theme,
    })),
  ];
}

function matches(expectation: PresidentialSearchExpectation, result: RankedResult): boolean {
  if (expectation.kind === "none") return false;
  if (expectation.kind === "theme") {
    return (
      (result.kind === "theme" && result.theme === expectation.theme) ||
      (result.kind === "measure" && result.theme === expectation.theme)
    );
  }
  if (expectation.kind === "candidate-theme") {
    return (
      result.kind === "measure" &&
      result.theme === expectation.theme &&
      normalize(result.candidateName) === normalize(expectation.name)
    );
  }
  return (
    (result.kind === "candidacy" && normalize(result.name) === normalize(expectation.name)) ||
    (result.kind === "measure" && normalize(result.candidateName) === normalize(expectation.name))
  );
}

export function evaluatePresidentialSearchCase(input: {
  testCase: PresidentialSearchEvaluationCase;
  result: PresidentialCorpusSearchResult;
  latencyMs: number;
  topK: number;
}): PresidentialSearchCaseEvaluation {
  const ranked = flatten(input.result);
  const topResults = ranked.slice(0, input.topK);
  const expectsNone = input.testCase.expectations.some(
    (expectation) => expectation.kind === "none"
  );
  const positiveExpectations = input.testCase.expectations.filter(
    (expectation) => expectation.kind !== "none"
  );
  const matchedExpectations = positiveExpectations.filter((expectation) =>
    topResults.some((result) => matches(expectation, result))
  ).length;
  const relevantInTopK = topResults.filter((result) =>
    positiveExpectations.some((expectation) => matches(expectation, result))
  ).length;
  const recallAtK = expectsNone
    ? null
    : matchedExpectations / Math.max(positiveExpectations.length, 1);
  const precisionAtK = expectsNone ? null : relevantInTopK / input.topK;

  return {
    id: input.testCase.id,
    category: input.testCase.category,
    query: input.testCase.query,
    latencyMs: input.latencyMs,
    total: input.result.total,
    returned: ranked.length,
    relevantInTopK,
    recallAtK,
    precisionAtK,
    passed: expectsNone ? ranked.length === 0 : matchedExpectations === positiveExpectations.length,
    expectations: input.testCase.expectations,
    topResults,
    semanticMaxSimilarity: input.result.semanticMaxSimilarity ?? null,
  };
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = values.toSorted((left, right) => left - right);
  return sorted[Math.min(Math.ceil(sorted.length * ratio) - 1, sorted.length - 1)] ?? 0;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function buildPresidentialSearchEvaluationReport(input: {
  electionSlug: string;
  topK: number;
  cases: PresidentialSearchCaseEvaluation[];
  generatedAt?: Date;
  strategy?: PresidentialSearchStrategy;
}): PresidentialSearchEvaluationReport {
  const negatives = input.cases.filter((item) => item.category === "negative");
  const positiveRecall = input.cases.flatMap((item) =>
    item.recallAtK === null ? [] : [item.recallAtK]
  );
  const positivePrecision = input.cases.flatMap((item) =>
    item.precisionAtK === null ? [] : [item.precisionAtK]
  );
  return {
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    electionSlug: input.electionSlug,
    strategy: input.strategy ?? "lexical",
    topK: input.topK,
    queryCount: input.cases.length,
    metrics: {
      recallAtK: average(positiveRecall),
      precisionAtK: average(positivePrecision),
      zeroResultRate:
        input.cases.filter((item) => item.returned === 0).length / Math.max(input.cases.length, 1),
      negativeFalsePositiveRate:
        negatives.filter((item) => item.returned > 0).length / Math.max(negatives.length, 1),
      latencyP50Ms: percentile(
        input.cases.map((item) => item.latencyMs),
        0.5
      ),
      latencyP95Ms: percentile(
        input.cases.map((item) => item.latencyMs),
        0.95
      ),
    },
    cases: input.cases,
  };
}
