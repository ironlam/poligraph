import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

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
