import type {
  PrecisionEditorialReason,
  PrecisionHumanDecision,
  RuffinPrecisionEntry,
} from "./fixtures/ruffin-precision-set";

type PipelineDecision = "MEASURE" | "OBJECTIVE" | "OTHER";

function pipelineDecision(entry: RuffinPrecisionEntry): PipelineDecision {
  return entry.modelClassification === "MEASURE" || entry.modelClassification === "OBJECTIVE"
    ? entry.modelClassification
    : "OTHER";
}

function precision(truePositives: number, falsePositives: number): number | null {
  const denominator = truePositives + falsePositives;
  return denominator === 0 ? null : truePositives / denominator;
}

export function evaluatePrecisionSet(
  entries: RuffinPrecisionEntry[],
  isAccepted: (entry: RuffinPrecisionEntry) => boolean = (entry) => entry.pipelineAccepted
) {
  const accepted = entries.filter(isAccepted);
  const truePositives = accepted.filter((entry) => entry.humanDecision !== "REJECT");
  const falsePositives = accepted.filter((entry) => entry.humanDecision === "REJECT");
  const byClassification = (classification: "MEASURE" | "OBJECTIVE") => {
    const expected = classification === "MEASURE" ? "ACCEPT_MEASURE" : "ACCEPT_OBJECTIVE";
    const classified = accepted.filter((entry) => entry.pipelineClassification === classification);
    const typeTruePositives = classified.filter((entry) => entry.humanDecision !== "REJECT");
    const typeFalsePositives = classified.filter((entry) => entry.humanDecision === "REJECT");
    const semanticMatches = classified.filter((entry) => entry.humanDecision === expected);

    return {
      accepted: classified.length,
      truePositives: typeTruePositives.length,
      falsePositives: typeFalsePositives.length,
      precision: precision(typeTruePositives.length, typeFalsePositives.length),
      semanticMatches: semanticMatches.length,
      semanticMismatches: typeTruePositives.length - semanticMatches.length,
    };
  };

  const falsePositivesByCause = falsePositives.reduce<
    Partial<Record<PrecisionEditorialReason, number>>
  >((counts, entry) => {
    counts[entry.editorialReason] = (counts[entry.editorialReason] ?? 0) + 1;
    return counts;
  }, {});

  const confusion = entries.reduce<
    Record<PrecisionHumanDecision, Record<PipelineDecision, number>>
  >(
    (matrix, entry) => {
      matrix[entry.humanDecision][pipelineDecision(entry)] += 1;
      return matrix;
    },
    {
      ACCEPT_MEASURE: { MEASURE: 0, OBJECTIVE: 0, OTHER: 0 },
      ACCEPT_OBJECTIVE: { MEASURE: 0, OBJECTIVE: 0, OTHER: 0 },
      REJECT: { MEASURE: 0, OBJECTIVE: 0, OTHER: 0 },
    }
  );

  return {
    sampleSize: entries.length,
    humanDistribution: {
      ACCEPT_MEASURE: entries.filter((entry) => entry.humanDecision === "ACCEPT_MEASURE").length,
      ACCEPT_OBJECTIVE: entries.filter((entry) => entry.humanDecision === "ACCEPT_OBJECTIVE")
        .length,
      REJECT: entries.filter((entry) => entry.humanDecision === "REJECT").length,
    },
    accepted: accepted.length,
    truePositives: truePositives.length,
    falsePositives: falsePositives.length,
    precision: precision(truePositives.length, falsePositives.length),
    byClassification: {
      MEASURE: byClassification("MEASURE"),
      OBJECTIVE: byClassification("OBJECTIVE"),
    },
    falsePositivesByCause,
    falsePositiveIds: falsePositives.map((entry) => entry.id),
    falseNegatives: {
      ACCEPT_MEASURE: entries
        .filter((entry) => entry.humanDecision === "ACCEPT_MEASURE" && !isAccepted(entry))
        .map((entry) => entry.id),
      ACCEPT_OBJECTIVE: entries
        .filter((entry) => entry.humanDecision === "ACCEPT_OBJECTIVE" && !isAccepted(entry))
        .map((entry) => entry.id),
    },
    confusion,
  };
}
