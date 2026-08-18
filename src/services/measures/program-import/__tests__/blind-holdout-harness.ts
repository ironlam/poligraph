import { createHash } from "node:crypto";

import { getNormalizationGroundingFailure } from "../extractor";
import type { ProgramImportReport } from "../pipeline";
import type {
  BlindHoldoutHumanDecision,
  RuffinBlindHoldoutEntry,
} from "./fixtures/ruffin-blind-holdout";
import type { RuffinBlindHoldoutObservation } from "./fixtures/ruffin-blind-holdout-observations";

type ReportProposal = ProgramImportReport["candidates"][number]["proposals"][number];
type PipelineClass = "MEASURE" | "OBJECTIVE" | "OTHER";

export type BlindHoldoutResult = {
  entry: RuffinBlindHoldoutEntry;
  proposal: ReportProposal;
};

type EvaluationResult = {
  entry: RuffinBlindHoldoutEntry;
  observation: RuffinBlindHoldoutObservation;
};

export function normalizeBlindCitation(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function blindCitationFingerprint(value: string): string {
  return createHash("sha256").update(normalizeBlindCitation(value)).digest("hex");
}

function asPipelineClass(value: string | undefined): PipelineClass {
  return value === "MEASURE" || value === "OBJECTIVE" ? value : "OTHER";
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

export function matchBlindHoldout(
  entries: RuffinBlindHoldoutEntry[],
  proposals: ReportProposal[]
): BlindHoldoutResult[] {
  return entries.map((entry) => {
    const fingerprint = blindCitationFingerprint(entry.sourceText);
    const matches = proposals.filter(
      (proposal) =>
        proposal.documentUrl === entry.documentUrl &&
        proposal.page === entry.page &&
        blindCitationFingerprint(proposal.sourceText) === fingerprint
    );
    if (matches.length !== 1) {
      throw new Error(`${entry.id}: ${matches.length} correspondance(s) exacte(s) dans le rapport`);
    }
    return { entry, proposal: matches[0]! };
  });
}

function evaluateResults(results: EvaluationResult[]) {
  const accepted = results.filter(({ observation }) => observation.accepted);
  const truePositives = accepted.filter(({ entry }) => entry.humanDecision !== "REJECT");
  const falsePositives = accepted.filter(({ entry }) => entry.humanDecision === "REJECT");
  const falseNegatives = results.filter(
    ({ entry, observation }) => entry.humanDecision !== "REJECT" && !observation.accepted
  );

  const confusion = results.reduce<
    Record<BlindHoldoutHumanDecision, Record<PipelineClass, number>>
  >(
    (matrix, { entry, observation }) => {
      matrix[entry.humanDecision][asPipelineClass(observation.modelClassification)] += 1;
      return matrix;
    },
    {
      ACCEPT_MEASURE: { MEASURE: 0, OBJECTIVE: 0, OTHER: 0 },
      ACCEPT_OBJECTIVE: { MEASURE: 0, OBJECTIVE: 0, OTHER: 0 },
      REJECT: { MEASURE: 0, OBJECTIVE: 0, OTHER: 0 },
    }
  );

  const byAcceptedClassification = (classification: "MEASURE" | "OBJECTIVE") => {
    const classified = accepted.filter(
      ({ observation }) => observation.classification === classification
    );
    const acceptable = classified.filter(({ entry }) => entry.humanDecision !== "REJECT");
    const semanticMatches = classified.filter(
      ({ entry }) => entry.humanDecision === `ACCEPT_${classification}`
    );
    return {
      accepted: classified.length,
      acceptable: acceptable.length,
      semanticMatches: semanticMatches.length,
      acceptancePrecision: ratio(acceptable.length, classified.length),
      semanticPrecision: ratio(semanticMatches.length, classified.length),
    };
  };

  const humanMeasures = results.filter(({ entry }) => entry.humanDecision === "ACCEPT_MEASURE");
  const humanObjectives = results.filter(({ entry }) => entry.humanDecision === "ACCEPT_OBJECTIVE");
  const preciseInformationAdded = accepted.filter(
    ({ observation }) => observation.preciseInformationAdded
  );

  return {
    sampleSize: results.length,
    humanDistribution: {
      ACCEPT_MEASURE: humanMeasures.length,
      ACCEPT_OBJECTIVE: humanObjectives.length,
      REJECT: results.filter(({ entry }) => entry.humanDecision === "REJECT").length,
    },
    accepted: accepted.length,
    truePositives: truePositives.length,
    falsePositives: falsePositives.length,
    falseNegatives: falseNegatives.length,
    precision: ratio(truePositives.length, accepted.length),
    recall: ratio(
      truePositives.length,
      results.filter(({ entry }) => entry.humanDecision !== "REJECT").length
    ),
    recallByHumanDecision: {
      ACCEPT_MEASURE: ratio(
        humanMeasures.filter(({ observation }) => observation.accepted).length,
        humanMeasures.length
      ),
      ACCEPT_OBJECTIVE: ratio(
        humanObjectives.filter(({ observation }) => observation.accepted).length,
        humanObjectives.length
      ),
    },
    byAcceptedClassification: {
      MEASURE: byAcceptedClassification("MEASURE"),
      OBJECTIVE: byAcceptedClassification("OBJECTIVE"),
    },
    confusion,
    semanticAcceptedTransitions: {
      humanMeasureToMeasure: humanMeasures.filter(
        ({ observation }) => observation.accepted && observation.classification === "MEASURE"
      ).length,
      humanMeasureToObjective: humanMeasures.filter(
        ({ observation }) => observation.accepted && observation.classification === "OBJECTIVE"
      ).length,
      humanObjectiveToMeasure: humanObjectives.filter(
        ({ observation }) => observation.accepted && observation.classification === "MEASURE"
      ).length,
      humanObjectiveToObjective: humanObjectives.filter(
        ({ observation }) => observation.accepted && observation.classification === "OBJECTIVE"
      ).length,
    },
    criticalFalsePositives: {
      provenanceCorruption: falsePositives.filter(
        ({ entry }) => entry.editorialReason === "PARSER_CORRUPTION"
      ).length,
      historical: falsePositives.filter(({ entry }) =>
        ["HISTORICAL_ACTION", "EXISTING_POLICY_DESCRIPTION"].includes(entry.editorialReason)
      ).length,
      thirdParty: falsePositives.filter(
        ({ entry }) => entry.editorialReason === "THIRD_PARTY_PROPOSAL"
      ).length,
      insufficientAttribution: falsePositives.filter(
        ({ entry }) => entry.editorialReason === "INSUFFICIENT_ATTRIBUTION"
      ).length,
      preciseInformationAdded: preciseInformationAdded.length,
    },
    falsePositiveIds: falsePositives.map(({ entry }) => entry.id),
    falseNegativeIds: falseNegatives.map(({ entry }) => entry.id),
    errors: {
      falsePositives: falsePositives.map(({ entry, observation }) => ({
        id: entry.id,
        humanDecision: entry.humanDecision,
        editorialReason: entry.editorialReason,
        modelClassification: observation.modelClassification,
        classification: observation.classification,
        acceptanceGuard: observation.acceptanceGuard,
        sourceText: entry.sourceText,
      })),
      falseNegatives: falseNegatives.map(({ entry, observation }) => ({
        id: entry.id,
        humanDecision: entry.humanDecision,
        editorialReason: entry.editorialReason,
        modelClassification: observation.modelClassification,
        classification: observation.classification,
        extractionGuard: observation.extractionGuard,
        acceptanceGuard: observation.acceptanceGuard,
        sourceText: entry.sourceText,
      })),
    },
  };
}

export function evaluateBlindHoldout(results: BlindHoldoutResult[]) {
  return evaluateResults(
    results.map(({ entry, proposal }) => ({
      entry,
      observation: {
        id: entry.id,
        modelClassification: proposal.modelClassification,
        classification: proposal.classification,
        accepted: proposal.accepted,
        extractionGuard: proposal.extractionGuard,
        acceptanceGuard: proposal.acceptanceGuard,
        preciseInformationAdded:
          proposal.accepted && proposal.normalizedText !== null
            ? getNormalizationGroundingFailure(proposal.sourceText, proposal.normalizedText) !==
              null
            : false,
      },
    }))
  );
}

export function evaluateFrozenBlindHoldout(
  entries: RuffinBlindHoldoutEntry[],
  observations: RuffinBlindHoldoutObservation[]
) {
  const byId = new Map(observations.map((observation) => [observation.id, observation]));
  if (byId.size !== entries.length || observations.length !== entries.length) {
    throw new Error("Les observations ne couvrent pas exactement le holdout aveugle");
  }
  return evaluateResults(
    entries.map((entry) => {
      const observation = byId.get(entry.id);
      if (!observation) throw new Error(`${entry.id}: observation absente`);
      return { entry, observation };
    })
  );
}
