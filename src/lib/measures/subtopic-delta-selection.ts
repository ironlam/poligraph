import type { MeasureSubtopicDefinition } from "@/config/measure-subtopics";
import type { MeasureSubtopicAssignmentStatus, ThemeCategory } from "@/generated/prisma";

export type DeltaSelectionSignal = "LEXICAL" | "NEIGHBOR_SUBTOPIC" | "SEARCH_INDEX" | "CONTROL";

export type DeltaExistingAssignment = {
  slug: string;
  status: MeasureSubtopicAssignmentStatus;
};

export type DeltaMeasureInput = {
  measureId: string;
  revisionId: string;
  sourceUpdatedAt: string;
  candidateName: string;
  theme: ThemeCategory;
  text: string;
  details: string | null;
  existingAssignments: DeltaExistingAssignment[];
};

export type DeltaSelectionReason = {
  signal: DeltaSelectionSignal;
  values: string[];
};

export type DeltaSelectedMeasure = DeltaMeasureInput & {
  selectionReasons: DeltaSelectionReason[];
  control: boolean;
};

export type DeltaSelectionResult = {
  candidates: DeltaSelectedMeasure[];
  ignoredExisting: Array<{
    measureId: string;
    revisionId: string;
    status: MeasureSubtopicAssignmentStatus;
  }>;
  signalCounts: Record<DeltaSelectionSignal, number>;
};

function normalize(value: string): string {
  return ` ${value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("fr")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function termVariants(rawTerm: string): string[] {
  const term = normalize(rawTerm).trim();
  if (term === "") return [];
  return term.endsWith("s") ? [term] : [term, `${term}s`];
}

export function findDeltaLexicalMatches(
  measure: Pick<DeltaMeasureInput, "text" | "details">,
  subtopic: Pick<MeasureSubtopicDefinition, "label" | "aliases">
): string[] {
  const content = normalize([measure.text, measure.details].filter(Boolean).join(" "));
  return [subtopic.label, ...subtopic.aliases].filter((term) =>
    termVariants(term).some((variant) => content.includes(` ${variant} `))
  );
}

function deterministicScore(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function selectDeterministicControlSample(
  measures: DeltaMeasureInput[],
  subtopicSlug: string,
  maximum = 10
): DeltaMeasureInput[] {
  if (measures.length === 0 || maximum < 1) return [];
  const sampleSize = Math.min(maximum, Math.max(1, Math.ceil(measures.length * 0.02)));
  return [...measures]
    .sort((left, right) => {
      const scoreDelta =
        deterministicScore(`${subtopicSlug}:${left.measureId}`) -
        deterministicScore(`${subtopicSlug}:${right.measureId}`);
      return scoreDelta || left.measureId.localeCompare(right.measureId);
    })
    .slice(0, sampleSize);
}

function addReason(
  reasons: DeltaSelectionReason[],
  signal: DeltaSelectionSignal,
  values: string[]
): void {
  if (values.length > 0) reasons.push({ signal, values });
}

export function selectSubtopicDeltaCandidates(input: {
  measures: DeltaMeasureInput[];
  subtopic: MeasureSubtopicDefinition;
  searchDocumentMeasureIds?: ReadonlySet<string>;
  controlSampleMaximum?: number;
}): DeltaSelectionResult {
  const ignoredExisting: DeltaSelectionResult["ignoredExisting"] = [];
  const selected = new Map<string, DeltaSelectedMeasure>();
  const eligibleForControl: DeltaMeasureInput[] = [];
  const neighborSlugs = new Set(input.subtopic.selectionNeighborSlugs ?? []);
  const searchIds = input.searchDocumentMeasureIds ?? new Set<string>();

  for (const measure of input.measures) {
    const targetAssignment = measure.existingAssignments.find(
      (assignment) => assignment.slug === input.subtopic.slug
    );
    if (targetAssignment) {
      ignoredExisting.push({
        measureId: measure.measureId,
        revisionId: measure.revisionId,
        status: targetAssignment.status,
      });
      continue;
    }

    const reasons: DeltaSelectionReason[] = [];
    addReason(reasons, "LEXICAL", findDeltaLexicalMatches(measure, input.subtopic));
    addReason(
      reasons,
      "NEIGHBOR_SUBTOPIC",
      measure.existingAssignments
        .filter(
          (assignment) => neighborSlugs.has(assignment.slug) && assignment.status !== "REJECTED"
        )
        .map((assignment) => assignment.slug)
    );
    addReason(reasons, "SEARCH_INDEX", searchIds.has(measure.measureId) ? [measure.measureId] : []);

    if (reasons.length > 0) {
      selected.set(measure.measureId, { ...measure, selectionReasons: reasons, control: false });
    } else {
      eligibleForControl.push(measure);
    }
  }

  for (const measure of selectDeterministicControlSample(
    eligibleForControl,
    input.subtopic.slug,
    input.controlSampleMaximum
  )) {
    selected.set(measure.measureId, {
      ...measure,
      selectionReasons: [{ signal: "CONTROL", values: ["deterministic-2-percent"] }],
      control: true,
    });
  }

  const candidates = input.measures.flatMap((measure) => {
    const candidate = selected.get(measure.measureId);
    return candidate ? [candidate] : [];
  });
  const signalCounts: DeltaSelectionResult["signalCounts"] = {
    LEXICAL: 0,
    NEIGHBOR_SUBTOPIC: 0,
    SEARCH_INDEX: 0,
    CONTROL: 0,
  };
  for (const candidate of candidates) {
    for (const reason of candidate.selectionReasons) signalCounts[reason.signal] += 1;
  }

  return { candidates, ignoredExisting, signalCounts };
}
