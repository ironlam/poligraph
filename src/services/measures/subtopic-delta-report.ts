import { createHash, randomUUID } from "node:crypto";
import {
  MEASURE_SUBTOPICS,
  MEASURE_SUBTOPIC_PREVIOUS_TAXONOMY_VERSION,
  MEASURE_SUBTOPIC_TAXONOMY_VERSION,
} from "@/config/measure-subtopics";
import { getSubtopicDeltaCorpusPage } from "@/lib/data/measure-subtopic-delta";
import { classifyMeasureForSubtopicDelta } from "@/services/measures/subtopic-delta-classifier";
import {
  selectSubtopicDeltaCandidates,
  type DeltaMeasureInput,
  type DeltaSelectedMeasure,
  type DeltaSelectionResult,
} from "@/lib/measures/subtopic-delta-selection";

export type SubtopicDeltaDecisionRecord = {
  measureId: string;
  revisionId: string;
  sourceUpdatedAt: string;
  sourceFingerprint: string;
  candidateName: string;
  theme: DeltaSelectedMeasure["theme"];
  control: boolean;
  selectionReasons: DeltaSelectedMeasure["selectionReasons"];
  decision: "APPLIES" | "DOES_NOT_APPLY" | "UNCERTAIN";
  confidence: number;
  justification: string;
  evidenceExcerpt: string;
  classifierVersion: string;
};

export type SubtopicDeltaReport = {
  schemaVersion: 1;
  runId: string;
  createdAt: string;
  taxonomy: { previousVersion: string; currentVersion: string };
  subtopic: { slug: string; label: string; theme: string };
  election: { id: string; slug: string };
  parameters: {
    subtopic: string;
    election: string;
    limit: number;
    after: string | null;
    dryRun: true;
  };
  totalEligibleMeasures: number;
  scannedMeasures: number;
  nextAfter: string | null;
  selectedMeasureCount: number;
  selectionBySignal: DeltaSelectionResult["signalCounts"];
  decisions: Record<"APPLIES" | "DOES_NOT_APPLY" | "UNCERTAIN", number>;
  distribution: { byCandidate: Record<string, number>; byTheme: Record<string, number> };
  suggestionsThatWouldBeCreated: SubtopicDeltaDecisionRecord[];
  ignoredExisting: DeltaSelectionResult["ignoredExisting"];
  controlSample: SubtopicDeltaDecisionRecord[];
  results: SubtopicDeltaDecisionRecord[];
  errors: Array<{ measureId: string; revisionId: string; message: string; control: boolean }>;
};

export function createSubtopicDeltaSourceFingerprint(
  measure: Pick<DeltaMeasureInput, "revisionId" | "sourceUpdatedAt" | "text" | "details">
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        revisionId: measure.revisionId,
        sourceUpdatedAt: measure.sourceUpdatedAt,
        text: measure.text,
        details: measure.details,
      })
    )
    .digest("hex");
}

function increment(counter: Record<string, number>, key: string): void {
  counter[key] = (counter[key] ?? 0) + 1;
}

export async function generateSubtopicDeltaDryRun(input: {
  subtopicSlug: string;
  electionSlug: string;
  limit: number;
  after?: string;
  runId?: string;
}): Promise<SubtopicDeltaReport> {
  const subtopic = MEASURE_SUBTOPICS.find((item) => item.slug === input.subtopicSlug);
  if (!subtopic) throw new Error(`Sous-thème inconnu : ${input.subtopicSlug}`);

  const { election, totalEligibleMeasures, measures, searchDocumentMeasureIds, nextAfter } =
    await getSubtopicDeltaCorpusPage({
      electionSlug: input.electionSlug,
      theme: subtopic.theme,
      searchTerms: [subtopic.label, ...subtopic.aliases],
      limit: input.limit,
      after: input.after,
    });
  const selection = selectSubtopicDeltaCandidates({
    measures,
    subtopic,
    searchDocumentMeasureIds,
  });
  const results: SubtopicDeltaDecisionRecord[] = [];
  const errors: SubtopicDeltaReport["errors"] = [];

  for (const measure of selection.candidates) {
    try {
      const decision = await classifyMeasureForSubtopicDelta({ measure, subtopic });
      results.push({
        measureId: measure.measureId,
        revisionId: measure.revisionId,
        sourceUpdatedAt: measure.sourceUpdatedAt,
        sourceFingerprint: createSubtopicDeltaSourceFingerprint(measure),
        candidateName: measure.candidateName,
        theme: measure.theme,
        control: measure.control,
        selectionReasons: measure.selectionReasons,
        ...decision,
      });
    } catch (error) {
      errors.push({
        measureId: measure.measureId,
        revisionId: measure.revisionId,
        message: error instanceof Error ? error.message : String(error),
        control: measure.control,
      });
    }
  }

  const decisions = { APPLIES: 0, DOES_NOT_APPLY: 0, UNCERTAIN: 0 };
  const byCandidate: Record<string, number> = {};
  const byTheme: Record<string, number> = {};
  for (const result of results) {
    decisions[result.decision] += 1;
    increment(byCandidate, result.candidateName);
    increment(byTheme, result.theme);
  }

  return {
    schemaVersion: 1,
    runId: input.runId ?? randomUUID(),
    createdAt: new Date().toISOString(),
    taxonomy: {
      previousVersion: MEASURE_SUBTOPIC_PREVIOUS_TAXONOMY_VERSION,
      currentVersion: MEASURE_SUBTOPIC_TAXONOMY_VERSION,
    },
    subtopic: { slug: subtopic.slug, label: subtopic.label, theme: subtopic.theme },
    election,
    parameters: {
      subtopic: input.subtopicSlug,
      election: input.electionSlug,
      limit: input.limit,
      after: input.after ?? null,
      dryRun: true,
    },
    totalEligibleMeasures,
    scannedMeasures: measures.length,
    nextAfter,
    selectedMeasureCount: selection.candidates.length,
    selectionBySignal: selection.signalCounts,
    decisions,
    distribution: { byCandidate, byTheme },
    suggestionsThatWouldBeCreated: results.filter((result) => result.decision === "APPLIES"),
    ignoredExisting: selection.ignoredExisting,
    controlSample: results.filter((result) => result.control),
    results,
    errors,
  };
}
