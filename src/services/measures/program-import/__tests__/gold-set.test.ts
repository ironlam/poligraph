import { describe, expect, it } from "vitest";
import { isAcceptedProposal } from "../policy";
import type { ExtractedProposal } from "../types";
import type { GoldObservedProposal } from "./gold-harness";
import { evaluateGoldSet, summarizeRejectedProposalGuards } from "./gold-harness";
import { RUFFIN_GOLD_SET } from "./fixtures/ruffin-gold-set";

describe("gold set François Ruffin", () => {
  it("reste dans la taille de calibration attendue", () => {
    expect(RUFFIN_GOLD_SET.length).toBeGreaterThanOrEqual(30);
    expect(RUFFIN_GOLD_SET.length).toBeLessThanOrEqual(50);
  });

  it("couvre toutes les classifications avec une part substantielle de mesures", () => {
    const counts = RUFFIN_GOLD_SET.reduce<Record<string, number>>((result, entry) => {
      result[entry.expectedClassification] = (result[entry.expectedClassification] ?? 0) + 1;
      return result;
    }, {});
    expect(counts).toEqual({
      MEASURE: 14,
      OBJECTIVE: 5,
      DIAGNOSIS: 8,
      VALUE: 4,
      GENERAL_INTENT: 5,
      AMBIGUOUS: 4,
    });
  });

  it("conserve une provenance officielle et auditable pour chaque extrait", () => {
    for (const entry of RUFFIN_GOLD_SET) {
      expect(entry.documentUrl).toMatch(
        /^https:\/\/nouspresident\.fr\/wp-content\/uploads\/2026\//
      );
      expect(entry.page).toBeGreaterThan(0);
      expect(entry.sourceText.length).toBeGreaterThan(15);
      expect(entry.notes.length).toBeGreaterThan(10);
    }
  });

  it("ne laisse pas la frontière déterministe casser les 14 mesures ni accepter les 21 non-actions", () => {
    const decisions = RUFFIN_GOLD_SET.map((entry) => ({
      entry,
      accepted: isAcceptedProposal({
        sourceText: entry.sourceText,
        normalizedText: entry.expectedNormalizedText ?? entry.sourceText,
        classification: entry.expectedClassification,
        modelClassification: entry.expectedClassification,
        theme: entry.expectedTheme,
        confidence: 0.9,
        rationale: entry.notes,
        extractionGuard: null,
        normalizationFallback: null,
        historicalContext: false,
        page: entry.page,
      } as ExtractedProposal),
    }));

    expect(
      decisions.filter(
        ({ entry, accepted }) => entry.expectedClassification === "MEASURE" && accepted
      )
    ).toHaveLength(14);
    expect(
      decisions.filter(
        ({ entry, accepted }) => entry.expectedClassification === "OBJECTIVE" && accepted
      )
    ).toHaveLength(5);
    expect(
      decisions.filter(
        ({ entry, accepted }) =>
          !["MEASURE", "OBJECTIVE"].includes(entry.expectedClassification) && accepted
      )
    ).toHaveLength(0);
  });

  it("retrouve une citation étendue sur la même page sans produire un match sémantique", () => {
    const entry = RUFFIN_GOLD_SET.find((item) => item.id === "loisirs-measure-premier-depart")!;
    const proposals: GoldObservedProposal[] = [
      {
        documentUrl: entry.documentUrl,
        page: entry.page,
        sourceText: `${entry.sourceText} Sur le modèle d'une expérimentation locale, chaque enfant pourra ensuite bénéficier d'un séjour collectif financé pendant la scolarité obligatoire, sans démarche à effectuer par les familles.`,
        normalizedText: entry.expectedNormalizedText ?? null,
        classification: "MEASURE",
        theme: entry.expectedTheme,
        confidence: 0.9,
        rationale: "Action explicite.",
        accepted: true,
      },
    ];

    expect(
      evaluateGoldSet({
        gold: [entry],
        proposals,
        matcher: "LEGACY_MAX_TOKEN_OVERLAP",
      }).metrics.detected
    ).toBe(0);
    expect(
      evaluateGoldSet({ gold: [entry], proposals, matcher: "PAGE_CITATION_COVERAGE" }).metrics
    ).toMatchObject({
      detected: 1,
      measuresDetected: 1,
      correctlyClassified: 1,
      correctlyClassifiedActionsAccepted: 1,
    });
  });

  it("ne confond pas une proposition voisine avec un gold absent", () => {
    const entry = RUFFIN_GOLD_SET.find((item) => item.id === "travail-objective-reconversion")!;
    const proposals: GoldObservedProposal[] = [
      {
        documentUrl: entry.documentUrl,
        page: entry.page,
        sourceText: "Orienter les fonds vers la formation des salariés essentiels.",
        normalizedText: "Orienter les fonds vers la formation des salariés essentiels.",
        classification: "MEASURE",
        theme: "EMPLOI_TRAVAIL",
        confidence: 0.9,
        rationale: "Action explicite.",
        accepted: true,
      },
    ];
    const result = evaluateGoldSet({
      gold: [entry],
      proposals,
      matcher: "PAGE_CITATION_COVERAGE",
      demonstratedAbsenceCauses: { [entry.id]: "PARSER_OR_SEGMENTATION" },
    });
    expect(result.rows[0]).toMatchObject({
      detected: false,
      absenceCause: "PARSER_OR_SEGMENTATION",
    });
  });

  it("sépare les étages détection, classification et acceptation", () => {
    const entries = RUFFIN_GOLD_SET.filter((item) =>
      ["travail-measure-indexation", "loisirs-diagnosis-contrats-aides-2017"].includes(item.id)
    );
    const proposals: GoldObservedProposal[] = entries.map((entry) => ({
      documentUrl: entry.documentUrl,
      page: entry.page,
      sourceText: entry.sourceText,
      normalizedText: entry.sourceText,
      classification: "MEASURE",
      theme: entry.expectedTheme,
      confidence: 0.9,
      rationale: "Action explicite.",
      accepted: entry.expectedClassification === "MEASURE",
    }));
    const result = evaluateGoldSet({
      gold: entries,
      proposals,
      matcher: "PAGE_CITATION_COVERAGE",
    });
    expect(result.metrics).toMatchObject({
      detected: 2,
      measuresDetected: 1,
      correctlyClassified: 1,
      actionsAccepted: 1,
      nonActionsAccepted: 0,
      historicalAccepted: 0,
    });
    expect(result.metrics.confusion).toEqual({
      MEASURE: { MEASURE: 1 },
      DIAGNOSIS: { MEASURE: 1 },
    });
  });

  it("compte séparément les gardes et les ajouts précis survivants", () => {
    const entry = RUFFIN_GOLD_SET[0]!;
    const summary = summarizeRejectedProposalGuards([
      {
        documentUrl: entry.documentUrl,
        page: entry.page,
        sourceText: "Nous augmenterons le SMIC.",
        normalizedText: null,
        classification: "AMBIGUOUS",
        theme: "EMPLOI_TRAVAIL",
        confidence: 0.9,
        rationale: "Normalisation écartée par la garde déterministe: NUMBER_ADDED.",
        accepted: false,
      },
    ]);
    expect(summary).toEqual({
      guards: { NUMBER_ADDED: 1 },
      normalizationFallbacks: {},
      preciseInformationAdded: 0,
    });
  });

  it("détecte un faux positif historique même si la citation du modèle est raccourcie", () => {
    const entry = RUFFIN_GOLD_SET.find((item) => item.id === "loisirs-diagnosis-proposition-2023")!;
    const observed = {
      documentUrl: entry.documentUrl,
      page: entry.page,
      sourceText: "Proposition de loi portant mesures d’urgence pour les vacances",
      normalizedText: "Proposition de loi portant mesures d’urgence pour les vacances",
      classification: "MEASURE" as const,
      theme: "EDUCATION_CULTURE" as const,
      confidence: 0.9,
      rationale: "Action législative.",
      accepted: true,
    };
    const unsafe = evaluateGoldSet({
      gold: [entry],
      proposals: [observed],
      matcher: "PAGE_CITATION_COVERAGE",
    });
    expect(unsafe.metrics).toMatchObject({ nonActionsAccepted: 1, historicalAccepted: 1 });

    const safe = evaluateGoldSet({
      gold: [entry],
      proposals: [{ ...observed, historicalContext: true, accepted: false }],
      matcher: "PAGE_CITATION_COVERAGE",
    });
    expect(safe.metrics).toMatchObject({ nonActionsAccepted: 0, historicalAccepted: 0 });
  });
});
