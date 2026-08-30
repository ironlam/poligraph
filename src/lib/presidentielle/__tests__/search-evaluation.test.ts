import { describe, expect, it } from "vitest";
import { PRESIDENTIAL_SEARCH_EVALUATION_CASES } from "@/config/presidential-search-evaluation";
import {
  buildPresidentialSearchEvaluationReport,
  evaluatePresidentialSearchCase,
} from "../search-evaluation";

const emptyBase = { query: "", total: 0, candidacies: [], measures: [], subjects: [] };

describe("évaluation de la recherche présidentielle", () => {
  it("conserve cinquante requêtes éditoriales identifiables sans doublon", () => {
    expect(PRESIDENTIAL_SEARCH_EVALUATION_CASES).toHaveLength(50);
    expect(new Set(PRESIDENTIAL_SEARCH_EVALUATION_CASES.map((item) => item.id)).size).toBe(50);
    expect(
      PRESIDENTIAL_SEARCH_EVALUATION_CASES.filter((item) => item.category === "negative")
    ).toHaveLength(4);
  });

  it("compte comme pertinent un thème et les mesures qui lui sont rattachées", () => {
    const evaluation = evaluatePresidentialSearchCase({
      testCase: {
        id: "sante",
        category: "natural",
        query: "déserts médicaux",
        expectations: [{ kind: "theme", theme: "SANTE" }],
      },
      result: {
        ...emptyBase,
        total: 2,
        subjects: [{ type: "subject", theme: "SANTE", label: "Santé", url: "/sante" }],
        measures: [
          {
            type: "measure",
            id: "measure-1",
            text: "Former davantage de médecins",
            url: "/mesure-1",
            candidateName: "Alice Martin",
            theme: "SANTE",
            precision: null,
            sourceLabel: null,
          },
        ],
      },
      latencyMs: 42,
      topK: 5,
    });

    expect(evaluation).toMatchObject({ passed: true, recallAtK: 1, precisionAtK: 0.4 });
  });

  it("signale un faux positif sur une requête négative", () => {
    const evaluation = evaluatePresidentialSearchCase({
      testCase: {
        id: "negative",
        category: "negative",
        query: "xylophone",
        expectations: [{ kind: "none" }],
      },
      result: {
        ...emptyBase,
        total: 1,
        subjects: [{ type: "subject", theme: "SANTE", label: "Santé", url: "/sante" }],
      },
      latencyMs: 10,
      topK: 5,
    });

    expect(evaluation).toMatchObject({ passed: false, recallAtK: null, precisionAtK: null });
  });

  it("exige qu'un résultat candidat plus thème soit une mesure à l'intersection", () => {
    const evaluation = evaluatePresidentialSearchCase({
      testCase: {
        id: "candidate-theme",
        category: "candidate",
        query: "Alice Martin santé",
        expectations: [{ kind: "candidate-theme", name: "Alice Martin", theme: "SANTE" }],
      },
      result: {
        ...emptyBase,
        total: 2,
        subjects: [{ type: "subject", theme: "SANTE", label: "Santé", url: "/sante" }],
        candidacies: [
          {
            type: "candidacy",
            id: "candidate-1",
            name: "Alice Martin",
            url: "/alice",
            photoUrl: null,
            blobPhotoUrl: null,
            status: "DECLARE",
            party: null,
          },
        ],
      },
      latencyMs: 10,
      topK: 5,
    });

    expect(evaluation).toMatchObject({ passed: false, recallAtK: 0, relevantInTopK: 0 });
  });

  it("agrège les métriques et les percentiles sans masquer les cas individuels", () => {
    const passing = evaluatePresidentialSearchCase({
      testCase: {
        id: "theme",
        category: "exact",
        query: "santé",
        expectations: [{ kind: "theme", theme: "SANTE" }],
      },
      result: {
        ...emptyBase,
        total: 1,
        subjects: [{ type: "subject", theme: "SANTE", label: "Santé", url: "/sante" }],
      },
      latencyMs: 20,
      topK: 5,
    });
    const negative = evaluatePresidentialSearchCase({
      testCase: {
        id: "none",
        category: "negative",
        query: "xylophone",
        expectations: [{ kind: "none" }],
      },
      result: emptyBase,
      latencyMs: 80,
      topK: 5,
    });
    const report = buildPresidentialSearchEvaluationReport({
      electionSlug: "presidentielle-2027",
      topK: 5,
      cases: [passing, negative],
      generatedAt: new Date("2026-08-30T12:00:00Z"),
    });

    expect(report.metrics).toEqual({
      recallAtK: 1,
      precisionAtK: 0.2,
      zeroResultRate: 0.5,
      negativeFalsePositiveRate: 0,
      latencyP50Ms: 20,
      latencyP95Ms: 80,
    });
    expect(report.cases).toHaveLength(2);
  });
});
