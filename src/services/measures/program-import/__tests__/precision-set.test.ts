import { describe, expect, it } from "vitest";
import { getProposalAcceptanceGuard } from "../policy";
import type { ExtractedProposal } from "../types";
import { RUFFIN_PRECISION_SET } from "./fixtures/ruffin-precision-set";
import { evaluatePrecisionSet } from "./precision-harness";

function acceptanceGuard(entry: (typeof RUFFIN_PRECISION_SET)[number]) {
  const normalizedText =
    entry.normalizedText ??
    (entry.pipelineClassification === "MEASURE" || entry.pipelineClassification === "OBJECTIVE"
      ? entry.sourceText
      : null);
  return getProposalAcceptanceGuard({
    sourceText: entry.sourceText,
    normalizedText,
    classification: entry.pipelineClassification,
    modelClassification: entry.modelClassification,
    theme: "INSTITUTIONS",
    confidence: 0.9,
    rationale: "Sortie réelle annotée.",
    extractionGuard: null,
    normalizationFallback: null,
    exactSourceFallback: entry.normalizedText === null && normalizedText !== null,
    historicalContext: false,
    page: entry.page,
  } as ExtractedProposal);
}

describe("precision set François Ruffin", () => {
  it("fige un échantillon substantiel, risqué et auditable", () => {
    expect(RUFFIN_PRECISION_SET).toHaveLength(120);
    expect(new Set(RUFFIN_PRECISION_SET.map((entry) => entry.id)).size).toBe(120);
    expect(new Set(RUFFIN_PRECISION_SET.map((entry) => entry.documentUrl)).size).toBe(3);
    expect(RUFFIN_PRECISION_SET.filter((entry) => entry.pipelineAccepted).length).toBeGreaterThan(
      80
    );
    expect(RUFFIN_PRECISION_SET.filter((entry) => !entry.pipelineAccepted).length).toBeGreaterThan(
      15
    );
    for (const entry of RUFFIN_PRECISION_SET) {
      expect(entry.sourceText.length).toBeGreaterThan(3);
      expect(entry.documentUrl).toMatch(
        /^https:\/\/nouspresident\.fr\/wp-content\/uploads\/2026\//
      );
      expect(entry.page).toBeGreaterThan(0);
      expect(entry.editorialReason.length).toBeGreaterThan(3);
    }
  });

  it("fige les décisions humaines indépendamment de la sortie pipeline", () => {
    const metrics = evaluatePrecisionSet(RUFFIN_PRECISION_SET);
    expect(metrics.humanDistribution).toEqual({
      ACCEPT_MEASURE: 51,
      ACCEPT_OBJECTIVE: 30,
      REJECT: 39,
    });
  });

  it("mesure séparément precision, confusion et faux négatifs", () => {
    const metrics = evaluatePrecisionSet(RUFFIN_PRECISION_SET);
    expect(metrics).toMatchObject({
      sampleSize: 120,
      accepted: 95,
      truePositives: 68,
      falsePositives: 27,
      precision: 68 / 95,
      byClassification: {
        MEASURE: { accepted: 77, falsePositives: 25, precision: 52 / 77 },
        OBJECTIVE: { accepted: 18, falsePositives: 2, precision: 16 / 18 },
      },
      falsePositivesByCause: {
        EXISTING_POLICY_DESCRIPTION: 2,
        GENERAL_INTENT: 4,
        HISTORICAL_ACTION: 1,
        INSUFFICIENT_ATTRIBUTION: 2,
        RHETORICAL_FORMULATION: 3,
        SLOGAN: 8,
        THIRD_PARTY_PROPOSAL: 1,
        TITLE_ONLY: 6,
      },
    });
    expect(metrics.falseNegatives.ACCEPT_MEASURE).toHaveLength(11);
    expect(metrics.falseNegatives.ACCEPT_OBJECTIVE).toHaveLength(2);
  });

  it("mesure la frontière d'acceptation recalibrée sans modifier les annotations", () => {
    const metrics = evaluatePrecisionSet(
      RUFFIN_PRECISION_SET,
      (entry) => acceptanceGuard(entry) === null
    );
    const survivingHistorical = RUFFIN_PRECISION_SET.filter(
      (entry) => entry.editorialReason === "HISTORICAL_ACTION" && acceptanceGuard(entry) === null
    );
    const survivingThirdParty = RUFFIN_PRECISION_SET.filter(
      (entry) => entry.editorialReason === "THIRD_PARTY_PROPOSAL" && acceptanceGuard(entry) === null
    );
    const acceptanceGuards = RUFFIN_PRECISION_SET.filter((entry) => entry.pipelineAccepted).reduce<
      Record<string, number>
    >((counts, entry) => {
      const guard = acceptanceGuard(entry);
      if (guard) counts[guard] = (counts[guard] ?? 0) + 1;
      return counts;
    }, {});

    expect(metrics.precision).toBeGreaterThanOrEqual(0.95);
    expect(survivingHistorical).toEqual([]);
    expect(survivingThirdParty).toEqual([]);
    expect(metrics).toMatchObject({
      sampleSize: 120,
      accepted: 69,
      truePositives: 69,
      falsePositives: 0,
      precision: 1,
      byClassification: {
        MEASURE: { accepted: 51, falsePositives: 0, precision: 1 },
        OBJECTIVE: { accepted: 18, falsePositives: 0, precision: 1 },
      },
      falsePositiveIds: [],
    });
    expect(metrics.falseNegatives.ACCEPT_MEASURE).toHaveLength(11);
    expect(metrics.falseNegatives.ACCEPT_OBJECTIVE).toEqual(["calibrated-accepted-46"]);
    expect(acceptanceGuards).toEqual({
      DEPENDENT_FRAGMENT: 4,
      DESCRIPTIVE_EXISTING_POLICY: 2,
      GENERAL_INTENT_FORMULATION: 1,
      HISTORICAL_REFERENCE: 1,
      INSUFFICIENT_ATTRIBUTION: 1,
      RHETORICAL_FORMULATION: 6,
      SLOGAN_OR_PRINCIPLE: 8,
      TITLE_OR_NOMINAL_LABEL: 5,
    });
  });
});
