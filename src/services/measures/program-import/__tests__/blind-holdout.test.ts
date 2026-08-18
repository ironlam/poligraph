import { describe, expect, it } from "vitest";
import {
  blindCitationFingerprint,
  evaluateFrozenBlindHoldout,
  normalizeBlindCitation,
} from "./blind-holdout-harness";
import {
  PREVIOUS_RUFFIN_HOLDOUT_FINGERPRINTS,
  RUFFIN_EXTRACTOR_V5_EXAMPLES,
} from "./fixtures/ruffin-blind-holdout-independence";
import {
  RUFFIN_BLIND_HOLDOUT,
  RUFFIN_BLIND_HOLDOUT_VERSION,
} from "./fixtures/ruffin-blind-holdout";
import { RUFFIN_GOLD_SET } from "./fixtures/ruffin-gold-set";
import { RUFFIN_PRECISION_SET } from "./fixtures/ruffin-precision-set";
import { RUFFIN_BLIND_HOLDOUT_OBSERVATIONS } from "./fixtures/ruffin-blind-holdout-observations";
import { finalizeProposalForReview } from "../policy";
import type { ExtractedProposal } from "../types";

describe("holdout aveugle François Ruffin", () => {
  it("fige 60 annotations aveugles équilibrées entre les trois cahiers", () => {
    expect(RUFFIN_BLIND_HOLDOUT_VERSION).toBe("ruffin-blind-holdout-v1-pre-reveal-2026-08-16");
    expect(RUFFIN_BLIND_HOLDOUT).toHaveLength(60);
    expect(new Set(RUFFIN_BLIND_HOLDOUT.map((entry) => entry.id)).size).toBe(60);

    const perDocument = Map.groupBy(RUFFIN_BLIND_HOLDOUT, (entry) => entry.documentUrl);
    expect(perDocument.size).toBe(3);
    expect([...perDocument.values()].map((entries) => entries.length).sort()).toEqual([20, 20, 20]);
    expect(
      RUFFIN_BLIND_HOLDOUT.reduce<Record<string, number>>((counts, entry) => {
        counts[entry.humanDecision] = (counts[entry.humanDecision] ?? 0) + 1;
        return counts;
      }, {})
    ).toEqual({ ACCEPT_OBJECTIVE: 9, ACCEPT_MEASURE: 27, REJECT: 24 });
  });

  it("ne contient aucun résultat pipeline révélé dans la fixture humaine", () => {
    for (const entry of RUFFIN_BLIND_HOLDOUT) {
      expect(entry).not.toHaveProperty("accepted");
      expect(entry).not.toHaveProperty("classification");
      expect(entry).not.toHaveProperty("modelClassification");
      expect(entry).not.toHaveProperty("acceptanceGuard");
      expect(entry).not.toHaveProperty("extractionGuard");
    }
  });

  it("est disjoint du gold, du precision set, du holdout précédent et du prompt v5", () => {
    const holdoutFingerprints = new Set(
      RUFFIN_BLIND_HOLDOUT.map((entry) => blindCitationFingerprint(entry.sourceText))
    );
    expect(holdoutFingerprints.size).toBe(60);

    const calibratedFingerprints = new Set([
      ...RUFFIN_GOLD_SET.map((entry) => blindCitationFingerprint(entry.sourceText)),
      ...RUFFIN_PRECISION_SET.map((entry) => blindCitationFingerprint(entry.sourceText)),
    ]);
    expect([...holdoutFingerprints].filter((value) => calibratedFingerprints.has(value))).toEqual(
      []
    );
    expect(
      [...holdoutFingerprints].filter((value) =>
        PREVIOUS_RUFFIN_HOLDOUT_FINGERPRINTS.includes(
          value as (typeof PREVIOUS_RUFFIN_HOLDOUT_FINGERPRINTS)[number]
        )
      )
    ).toEqual([]);

    const normalizedPromptExamples = RUFFIN_EXTRACTOR_V5_EXAMPLES.map(normalizeBlindCitation);
    const promptOverlaps = RUFFIN_BLIND_HOLDOUT.filter((entry) => {
      const citation = normalizeBlindCitation(entry.sourceText);
      return normalizedPromptExamples.some(
        (example) =>
          citation === example || citation.includes(example) || example.includes(citation)
      );
    });
    expect(promptOverlaps).toEqual([]);
  });

  it("couvre les familles de risque recherchées", () => {
    const covered = new Set(RUFFIN_BLIND_HOLDOUT.map((entry) => entry.riskCategory));
    expect(covered).toEqual(
      new Set([
        "EXPLICIT_ACTION",
        "QUANTIFIED_ACTION",
        "OBJECTIVE_WITHOUT_MEANS",
        "TITLE_OR_SLOGAN",
        "HISTORICAL_OR_EXISTING",
        "THIRD_PARTY_OR_QUOTATION",
        "DIAGNOSIS_OR_VALUE",
        "RHETORICAL_OR_HEADING",
        "SHORT_OR_FRAGMENT",
        "PARSER_GROUNDING",
      ])
    );
  });

  it("fige sans retuning les résultats de l'unique révélation indépendante", () => {
    const metrics = evaluateFrozenBlindHoldout(
      RUFFIN_BLIND_HOLDOUT,
      RUFFIN_BLIND_HOLDOUT_OBSERVATIONS
    );
    expect(metrics).toMatchObject({
      sampleSize: 60,
      accepted: 38,
      truePositives: 33,
      falsePositives: 5,
      falseNegatives: 3,
      precision: 33 / 38,
      recall: 33 / 36,
      falsePositiveIds: ["blind-6", "blind-43", "blind-49", "blind-50", "blind-55"],
      falseNegativeIds: ["blind-10", "blind-15", "blind-58"],
      criticalFalsePositives: {
        historical: 0,
        thirdParty: 0,
        insufficientAttribution: 0,
        preciseInformationAdded: 0,
      },
    });
  });

  it("utilise désormais blind-v1 uniquement comme régression des cinq faux positifs", () => {
    const entriesById = new Map(RUFFIN_BLIND_HOLDOUT.map((entry) => [entry.id, entry]));
    const currentObservations = RUFFIN_BLIND_HOLDOUT_OBSERVATIONS.map((observation) => {
      const entry = entriesById.get(observation.id)!;
      const finalized = finalizeProposalForReview({
        sourceText: entry.sourceText,
        normalizedText:
          observation.classification === "MEASURE" || observation.classification === "OBJECTIVE"
            ? entry.sourceText
            : null,
        modelClassification: observation.modelClassification,
        classification: observation.classification,
        theme: "INSTITUTIONS",
        confidence: 0.9,
        rationale: "Sortie blind-v1 consommée.",
        extractionGuard: observation.extractionGuard,
        normalizationFallback: null,
        exactSourceFallback: false,
        historicalContext: false,
        page: entry.page,
      } as ExtractedProposal);
      return {
        ...observation,
        accepted: finalized.accepted,
        acceptanceGuard: finalized.acceptanceGuard,
      };
    });
    const metrics = evaluateFrozenBlindHoldout(RUFFIN_BLIND_HOLDOUT, currentObservations);
    expect(metrics.falsePositiveIds).toEqual([]);
    expect(
      Object.fromEntries(
        ["blind-6", "blind-43", "blind-49", "blind-50", "blind-55"].map((id) => [
          id,
          currentObservations.find((observation) => observation.id === id)?.acceptanceGuard,
        ])
      )
    ).toEqual({
      "blind-6": "CORRUPTED_SOURCE_TEXT",
      "blind-43": "DEPENDENT_FRAGMENT",
      "blind-49": "TITLE_OR_NOMINAL_LABEL",
      "blind-50": "DEPENDENT_FRAGMENT",
      "blind-55": "MISSING_REFERENT",
    });
  });
});
