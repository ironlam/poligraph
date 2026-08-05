import { beforeEach, describe, expect, it, vi } from "vitest";

// Only the DB-backed collaborators are mocked. assessProcedureEvidence and
// assessPressAttribution stay real: they are pure, and mocking them would empty
// these tests of their meaning.
const mocks = vi.hoisted(() => ({
  resolveAffairPolitician: vi.fn(),
  findMatchingAffairs: vi.fn(),
  createDraftAffairFromDiscovery: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    pressArticle: { update: vi.fn(async () => ({})) },
    politician: {
      findUnique: vi.fn(async () => ({
        firstName: "Jeanne",
        lastName: "Martin",
        fullName: "Jeanne Martin",
      })),
    },
    pressArticleAffair: { upsert: vi.fn(async () => ({})) },
    affairPoliticianDecision: { update: vi.fn(async () => ({})) },
  },
}));

vi.mock("@/lib/affair-matching", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/affair-matching")>()),
  resolveAffairPolitician: mocks.resolveAffairPolitician,
}));

// pickConfidentMatch is pure and stays real; only the DB lookup is replaced.
vi.mock("@/services/affairs/matching", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/affairs/matching")>()),
  findMatchingAffairs: mocks.findMatchingAffairs,
}));

vi.mock("@/services/affairs/create-draft", () => ({
  createDraftAffairFromDiscovery: mocks.createDraftAffairFromDiscovery,
}));

import { isPressAnalysisSuccessful, processAnalyzedArticle } from "./press-analysis";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveAffairPolitician.mockResolvedValue({
    judgment: "NO_MATCH",
    topCandidateId: null,
    decisionId: null,
  });
  mocks.findMatchingAffairs.mockResolvedValue([]);
  mocks.createDraftAffairFromDiscovery.mockResolvedValue({ id: "aff-1", slug: "aff-1" });
});

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

/**
 * createAffairFromPress never passed `involvement` to
 * createDraftAffairFromDiscovery, so Prisma applied the schema default,
 * MENTIONED_ONLY. Yet the loop `continue`s on MENTIONED_ONLY detections: no
 * press-created affair should carry that value. A politician actually mis en
 * cause was stored as "ni mise en cause, ni poursuivie".
 */
describe("createAffairFromPress : involvement", () => {
  it("écrit l'implication détectée au lieu du défaut de schéma", async () => {
    mocks.resolveAffairPolitician.mockResolvedValue({
      judgment: "SAME",
      topCandidateId: "pol-1",
      decisionId: "dec-1",
    });

    const stats = zeroStats();
    await processAnalyzedArticle(
      {
        id: "a3",
        url: "https://example.com/z",
        title: "Titre",
        feedSource: "lemonde",
        publishedAt: new Date("2026-08-03"),
      },
      "Jeanne Martin a été mise en examen pour détournement de fonds publics.",
      {
        isAffairRelated: true,
        summary: "résumé",
        affairs: [
          {
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
          },
        ],
      },
      stats,
      { dryRun: false, verbose: false }
    );

    expect(stats.affairsCreated).toBe(1);
    expect(mocks.createDraftAffairFromDiscovery).toHaveBeenCalledWith(
      expect.objectContaining({ involvement: "DIRECT" })
    );
  });
});
