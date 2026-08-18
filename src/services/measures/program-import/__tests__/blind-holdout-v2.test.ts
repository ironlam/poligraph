import { describe, expect, it } from "vitest";
import { getProposalAcceptanceGuard } from "../policy";
import type { ExtractedProposal } from "../types";

import {
  blindCitationFingerprint,
  evaluateFrozenBlindHoldout,
  normalizeBlindCitation,
} from "./blind-holdout-harness";
import {
  PREVIOUS_RUFFIN_HOLDOUT_FINGERPRINTS,
  RUFFIN_EXTRACTOR_V5_EXAMPLES,
} from "./fixtures/ruffin-blind-holdout-independence";
import { RUFFIN_BLIND_HOLDOUT } from "./fixtures/ruffin-blind-holdout";
import {
  RUFFIN_BLIND_HOLDOUT_V2,
  RUFFIN_BLIND_HOLDOUT_V2_FREEZE,
  RUFFIN_BLIND_HOLDOUT_V2_VERSION,
} from "./fixtures/ruffin-blind-holdout-v2";
import { RUFFIN_GOLD_SET } from "./fixtures/ruffin-gold-set";
import { RUFFIN_PRECISION_SET } from "./fixtures/ruffin-precision-set";
import { RUFFIN_BLIND_HOLDOUT_V2_OBSERVATIONS } from "./fixtures/ruffin-blind-holdout-v2-observations";

describe("holdout François Ruffin v2 consommé pour calibration", () => {
  it("fige 60 annotations humaines réparties entre les trois cahiers", () => {
    expect(RUFFIN_BLIND_HOLDOUT_V2_VERSION).toBe("ruffin-blind-holdout-v2-pre-reveal-2026-08-16");
    expect(RUFFIN_BLIND_HOLDOUT_V2).toHaveLength(60);
    expect(new Set(RUFFIN_BLIND_HOLDOUT_V2.map((entry) => entry.id)).size).toBe(60);
    const perDocument = Map.groupBy(RUFFIN_BLIND_HOLDOUT_V2, (entry) => entry.documentUrl);
    expect([...perDocument.values()].map((entries) => entries.length).sort()).toEqual([20, 20, 20]);
    expect(
      Object.fromEntries(
        [...Map.groupBy(RUFFIN_BLIND_HOLDOUT_V2, (entry) => entry.humanDecision)].map(
          ([decision, entries]) => [decision, entries.length]
        )
      )
    ).toEqual({ ACCEPT_OBJECTIVE: 7, ACCEPT_MEASURE: 19, REJECT: 34 });
  });

  it("ne contient aucun résultat pipeline révélé", () => {
    for (const entry of RUFFIN_BLIND_HOLDOUT_V2) {
      expect(entry).not.toHaveProperty("accepted");
      expect(entry).not.toHaveProperty("classification");
      expect(entry).not.toHaveProperty("modelClassification");
      expect(entry).not.toHaveProperty("acceptanceGuard");
      expect(entry).not.toHaveProperty("extractionGuard");
    }
  });

  it("est distinct de tous les corpus antérieurs et du prompt v5", () => {
    const holdoutFingerprints = new Set(
      RUFFIN_BLIND_HOLDOUT_V2.map((entry) => blindCitationFingerprint(entry.sourceText))
    );
    const priorFingerprints = new Set([
      ...RUFFIN_GOLD_SET.map((entry) => blindCitationFingerprint(entry.sourceText)),
      ...RUFFIN_PRECISION_SET.map((entry) => blindCitationFingerprint(entry.sourceText)),
      ...RUFFIN_BLIND_HOLDOUT.map((entry) => blindCitationFingerprint(entry.sourceText)),
      ...PREVIOUS_RUFFIN_HOLDOUT_FINGERPRINTS,
    ]);
    expect(holdoutFingerprints.size).toBe(60);
    expect([...holdoutFingerprints].filter((value) => priorFingerprints.has(value))).toEqual([]);

    const promptExamples = RUFFIN_EXTRACTOR_V5_EXAMPLES.map(normalizeBlindCitation);
    expect(
      RUFFIN_BLIND_HOLDOUT_V2.filter((entry) => {
        const citation = normalizeBlindCitation(entry.sourceText);
        return promptExamples.some(
          (example) =>
            citation === example || citation.includes(example) || example.includes(citation)
        );
      })
    ).toEqual([]);
  });

  it("conserve les empreintes historiques sans présenter le code courant comme aveugle", () => {
    expect(RUFFIN_BLIND_HOLDOUT_V2_FREEZE).toMatchObject({
      seed: "ruffin-blind-holdout-v2",
      extractor: expect.stringMatching(/^[a-f0-9]{64}$/),
      parser: expect.stringMatching(/^[a-f0-9]{64}$/),
      pipeline: expect.stringMatching(/^[a-f0-9]{64}$/),
      policy: expect.stringMatching(/^[a-f0-9]{64}$/),
      types: expect.stringMatching(/^[a-f0-9]{64}$/),
      report: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it("n’utilise aucune page dont la provenance PDF a été bloquée", () => {
    expect(
      RUFFIN_BLIND_HOLDOUT_V2.filter(
        (entry) =>
          (entry.documentUrl.includes("Campagne_Web") && entry.page === 13) ||
          (entry.documentUrl.includes("Probite") && [15, 18].includes(entry.page))
      )
    ).toEqual([]);
  });

  it("fige les résultats de l’unique révélation sans modifier les annotations", () => {
    const metrics = evaluateFrozenBlindHoldout(
      RUFFIN_BLIND_HOLDOUT_V2,
      RUFFIN_BLIND_HOLDOUT_V2_OBSERVATIONS
    );
    expect(metrics).toMatchObject({
      sampleSize: 60,
      accepted: 37,
      truePositives: 26,
      falsePositives: 11,
      falseNegatives: 0,
      precision: 26 / 37,
      recall: 1,
      falsePositiveIds: [
        "blind-v2-3",
        "blind-v2-4",
        "blind-v2-6",
        "blind-v2-21",
        "blind-v2-22",
        "blind-v2-25",
        "blind-v2-31",
        "blind-v2-33",
        "blind-v2-35",
        "blind-v2-50",
        "blind-v2-55",
      ],
      falseNegativeIds: [],
      criticalFalsePositives: {
        provenanceCorruption: 0,
        historical: 0,
        thirdParty: 0,
        insufficientAttribution: 0,
        preciseInformationAdded: 0,
      },
    });
  });

  it("sert uniquement de régression consommée pour la policy d’autonomie", () => {
    const observations = new Map(
      RUFFIN_BLIND_HOLDOUT_V2_OBSERVATIONS.map((observation) => [observation.id, observation])
    );
    const recalibrated = RUFFIN_BLIND_HOLDOUT_V2.map((entry) => {
      const observation = observations.get(entry.id)!;
      const acceptanceGuard = getProposalAcceptanceGuard({
        sourceText: entry.sourceText,
        normalizedText: entry.sourceText,
        modelClassification: observation.modelClassification,
        classification: observation.classification,
        theme: "INSTITUTIONS",
        confidence: 0.9,
        page: entry.page,
        rationale: "Benchmark consommé CALIBRATION_ONLY.",
        extractionGuard: null,
        normalizationFallback: null,
        exactSourceFallback: false,
        historicalContext: false,
      } as ExtractedProposal);
      return { entry, acceptanceGuard, accepted: acceptanceGuard === null };
    });

    expect(
      Object.fromEntries(
        recalibrated
          .filter(({ entry }) => entry.humanDecision === "REJECT" && entry.id !== "blind-v2-8")
          .filter(({ entry }) =>
            [3, 4, 6, 21, 22, 25, 31, 33, 35, 50, 55].includes(
              Number(entry.id.replace("blind-v2-", ""))
            )
          )
          .map(({ entry, acceptanceGuard }) => [entry.id, acceptanceGuard])
      )
    ).toEqual({
      "blind-v2-3": "DEPENDENT_FRAGMENT",
      "blind-v2-4": "GENERAL_INTENT_FORMULATION",
      "blind-v2-6": "MISSING_REFERENT",
      "blind-v2-21": "RHETORICAL_FORMULATION",
      "blind-v2-22": "RHETORICAL_FORMULATION",
      "blind-v2-25": "MISSING_REFERENT",
      "blind-v2-31": "MISSING_REFERENT",
      "blind-v2-33": "MISSING_REFERENT",
      "blind-v2-35": "GENERAL_INTENT_FORMULATION",
      "blind-v2-50": "MISSING_REFERENT",
      "blind-v2-55": "MISSING_REFERENT",
    });
    expect(
      recalibrated.filter(({ entry, accepted }) => entry.humanDecision !== "REJECT" && !accepted)
    ).toEqual([]);
  });
});
