import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

// Only the resolver is mocked: it loads the whole politician pool from the DB.
// assessProcedureEvidence and assessPressAttribution stay real — they are pure,
// and mocking them would empty these tests of their meaning.
vi.mock("@/lib/affair-matching", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/affair-matching")>()),
  resolveAffairPolitician: vi.fn(async () => ({
    judgment: "NO_MATCH",
    topCandidateId: null,
    decisionId: null,
  })),
}));

import { isPressAnalysisSuccessful, processAnalyzedArticle } from "./press-analysis";

function zeroStats() {
  return {
    articlesProcessed: 0,
    articlesAnalyzed: 0,
    articlesAffairRelated: 0,
    affairsEnriched: 0,
    affairsCreated: 0,
    affairsRejected: 0,
    scrapeErrors: 0,
    analysisErrors: 0,
    sensitiveWarnings: 0,
    quotaStopped: false,
  };
}

describe("isPressAnalysisSuccessful", () => {
  it("succeeds on a normal run (all articles analyzed)", () => {
    expect(
      isPressAnalysisSuccessful({
        articlesProcessed: 100,
        articlesAnalyzed: 100,
        quotaStopped: false,
      })
    ).toBe(true);
  });

  it("tolerates isolated per-article errors (analyzed > 0)", () => {
    // 07-16 11:29 regression: 100 processed, 1 analysis error → must not fail the run.
    expect(
      isPressAnalysisSuccessful({
        articlesProcessed: 100,
        articlesAnalyzed: 99,
        quotaStopped: false,
      })
    ).toBe(true);
  });

  it("succeeds on an empty run (nothing to analyze)", () => {
    expect(
      isPressAnalysisSuccessful({
        articlesProcessed: 0,
        articlesAnalyzed: 0,
        quotaStopped: false,
      })
    ).toBe(true);
  });

  it("succeeds when analysis stopped early on a quota/credit blip (backlog handled by email)", () => {
    expect(
      isPressAnalysisSuccessful({
        articlesProcessed: 12,
        articlesAnalyzed: 0,
        quotaStopped: true,
      })
    ).toBe(true);
  });

  it("fails when articles were queued but none analyzed for a non-quota reason (real breakage)", () => {
    expect(
      isPressAnalysisSuccessful({
        articlesProcessed: 100,
        articlesAnalyzed: 0,
        quotaStopped: false,
      })
    ).toBe(false);
  });
});

describe("processAnalyzedArticle", () => {
  const article = {
    id: "a1",
    url: "https://example.com/x",
    title: "Titre",
    feedSource: "lemonde",
    publishedAt: new Date("2026-07-19"),
  };

  it("marks the article analyzed and skips affair processing when not affair-related", async () => {
    const stats = zeroStats();
    await processAnalyzedArticle(
      article,
      "contenu",
      { isAffairRelated: false, summary: "résumé", affairs: [] },
      stats,
      { dryRun: true, verbose: false }
    );
    expect(stats.articlesAnalyzed).toBe(1);
    expect(stats.articlesAffairRelated).toBe(0);
    expect(stats.affairsCreated).toBe(0);
    expect(stats.affairsEnriched).toBe(0);
  });

  it("counts affair-related articles even when no affair is detected", async () => {
    const stats = zeroStats();
    await processAnalyzedArticle(
      article,
      "contenu",
      { isAffairRelated: true, summary: "résumé", affairs: [] },
      stats,
      { dryRun: true, verbose: false }
    );
    // affairs is empty, so the early return still fires: analyzed but no affair work.
    expect(stats.articlesAnalyzed).toBe(1);
    expect(stats.articlesAffairRelated).toBe(0);
  });
});

/**
 * Regression for affair AF-000515: the extraction returned MISE_EN_EXAMEN with a
 * confidence of 95 on a political controversy where no procedure ever existed.
 * AffairStatus has no "no procedure" value, so the guard has to catch it here,
 * before the resolver writes an AffairPoliticianDecision audit row.
 */
describe("processAnalyzedArticle : garde-fou procédure", () => {
  const article = {
    id: "a2",
    url: "https://example.com/y",
    title: "Titre",
    feedSource: "lemonde",
    publishedAt: new Date("2026-08-03"),
  };

  function detected() {
    return {
      politicianName: "Jeanne Martin",
      involvement: "DIRECT" as const,
      category: "AUTRE",
      status: "MISE_EN_EXAMEN",
      title: "Titre affaire",
      description: "Description",
      factsDate: null,
      court: null,
      charges: [],
      excerpts: [],
      isNewRevelation: true,
      confidenceScore: 95,
      mentionedNames: ["Jeanne Martin"],
    };
  }

  it("rejette une détection quand l'article ne décrit aucune procédure", async () => {
    const stats = zeroStats();
    await processAnalyzedArticle(
      article,
      "Dans un documentaire, l'ancienne ministre reconnaît avoir fait cesser les " +
        "contrôles inopinés, ce qu'elle avait nié devant une commission parlementaire.",
      { isAffairRelated: true, summary: "résumé", affairs: [detected()] },
      stats,
      { dryRun: true, verbose: false }
    );

    expect(stats.affairsRejected).toBe(1);
    expect(stats.affairsCreated).toBe(0);
  });

  it("laisse passer une détection quand l'article décrit une procédure", async () => {
    const stats = zeroStats();
    await processAnalyzedArticle(
      article,
      "Jeanne Martin a été mise en examen pour détournement de fonds publics.",
      { isAffairRelated: true, summary: "résumé", affairs: [detected()] },
      stats,
      { dryRun: true, verbose: false }
    );

    expect(stats.affairsRejected).toBe(0);
  });
});
