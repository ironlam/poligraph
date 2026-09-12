import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AffairResolverContext } from "@/lib/affair-matching/persistence";
import { CandidatePrefilter } from "@/lib/affair-matching/candidate-prefilter";
import { EMPTY_SURNAME_VOCABULARY } from "@/lib/affair-matching/surname-ambiguity";

// Only the DB-backed collaborators are mocked. assessProcedureEvidence and
// assessPressAttribution stay real: they are pure, and mocking them would empty
// these tests of their meaning.
const mocks = vi.hoisted(() => ({
  resolveAffairPolitician: vi.fn(),
  previewAffairPolitician: vi.fn(),
  findMatchingAffairs: vi.fn(),
  createDraftAffairFromDiscovery: vi.fn(),
  proposeAffairEvent: vi.fn(),
  previewAffairEventProposal: vi.fn(),
  getResolverContext: vi.fn(),
  analyzeArticle: vi.fn(),
  getArticleScraper: vi.fn(),
  shouldSync: vi.fn(),
  markCompleted: vi.fn(),
  pressArticleFindMany: vi.fn(),
  pressArticleUpdate: vi.fn(async () => ({})),
}));

vi.mock("@/lib/db", () => ({
  db: {
    pressArticle: {
      findMany: mocks.pressArticleFindMany,
      update: mocks.pressArticleUpdate,
    },
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
  withAdvisoryLock: vi.fn(async (_key: string, callback: () => unknown) => callback()),
}));

vi.mock("@/lib/affair-matching", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/affair-matching")>()),
  resolveAffairPolitician: mocks.resolveAffairPolitician,
}));

vi.mock("@/lib/affair-matching/resolver", () => ({
  previewAffairPolitician: mocks.previewAffairPolitician,
}));
vi.mock("@/lib/affair-matching/persistence", () => ({
  createAffairResolverContextLoader: () => {
    let contextPromise: Promise<unknown> | undefined;
    return () => (contextPromise ??= mocks.getResolverContext());
  },
}));

vi.mock("@/services/press-analysis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/press-analysis")>()),
  analyzeArticle: mocks.analyzeArticle,
  getAIRateLimitMs: () => 0,
}));
vi.mock("@/lib/api/article-scraper", () => ({
  getArticleScraper: mocks.getArticleScraper,
}));
vi.mock("@/lib/sync", () => ({
  syncMetadata: {
    shouldSync: mocks.shouldSync,
    markCompleted: mocks.markCompleted,
  },
}));
vi.mock("@/services/affairs/import-run", () => ({
  IMPORTER_PRESS_ANALYSIS: "press-analysis",
  withImportRun: async (_importer: string, callback: (args: unknown) => unknown) =>
    callback({ importRunId: "run-press", setStats: vi.fn() }),
}));

// pickConfidentMatch is pure and stays real; only the DB lookup is replaced.
vi.mock("@/services/affairs/matching", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/affairs/matching")>()),
  findMatchingAffairs: mocks.findMatchingAffairs,
}));

vi.mock("@/services/affairs/create-draft", () => ({
  createDraftAffairFromDiscovery: mocks.createDraftAffairFromDiscovery,
}));

vi.mock("@/services/affairs/proposals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/affairs/proposals")>()),
  proposeAffairEvent: mocks.proposeAffairEvent,
  previewAffairEventProposal: mocks.previewAffairEventProposal,
}));

import {
  isPressAnalysisSuccessful,
  processAnalyzedArticle,
  syncPressAnalysis,
} from "./press-analysis";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveAffairPolitician.mockResolvedValue({
    judgment: "NO_MATCH",
    topCandidateId: null,
    decisionId: null,
  });
  mocks.previewAffairPolitician.mockResolvedValue({
    judgment: "NO_MATCH",
    topCandidateId: null,
    decisionId: null,
  });
  mocks.findMatchingAffairs.mockResolvedValue([]);
  mocks.createDraftAffairFromDiscovery.mockResolvedValue({ id: "aff-1", slug: "aff-1" });
  mocks.proposeAffairEvent.mockResolvedValue({
    outcome: "CREATED",
    pendingProposalId: "proposal-1",
    deduped: false,
  });
  mocks.previewAffairEventProposal.mockResolvedValue({
    outcome: "WOULD_CREATE",
    pendingProposalId: null,
    deduped: false,
  });
  const resolverContext: AffairResolverContext = {
    candidatePool: [],
    vocabulary: EMPTY_SURNAME_VOCABULARY,
    prefilter: new CandidatePrefilter([]),
  };
  mocks.getResolverContext.mockResolvedValue(resolverContext);
  mocks.shouldSync.mockResolvedValue(true);
  mocks.pressArticleFindMany.mockResolvedValue([]);
  mocks.getArticleScraper.mockReturnValue({ canScrape: () => false });
});

function zeroStats() {
  return {
    articlesProcessed: 0,
    articlesAnalyzed: 0,
    articlesAffairRelated: 0,
    affairsEnriched: 0,
    affairsCreated: 0,
    affairsRejected: 0,
    proposalsPending: 0,
    proposalsDeduped: 0,
    proposalsWouldCreate: 0,
    proposalsDedupedPending: 0,
    proposalsDedupedTerminal: 0,
    eventsAlreadyApplied: 0,
    ambiguousMatches: 0,
    insufficientSourceProvenance: 0,
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
    expect(mocks.getResolverContext).not.toHaveBeenCalled();
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

describe("processAnalyzedArticle : proposition d’évolution", () => {
  const article = {
    id: "article-evolution",
    url: "https://www.lemonde.fr/politique/article/2026/08/27/suivi-affaire.html",
    title: "Un nouvel article sur l’enquête",
    feedSource: "lemonde",
    publishedAt: new Date("2026-08-27T08:00:00.000Z"),
  };
  const excerpt = "Jeanne Martin fait toujours l’objet d’une enquête préliminaire.";
  const detected = {
    politicianName: "Jeanne Martin",
    involvement: "DIRECT" as const,
    category: "DETOURNEMENT_FONDS_PUBLICS",
    categoryValidated: true,
    status: "ENQUETE_PRELIMINAIRE",
    statusValidated: true,
    title: "Enquête sur des marchés publics contestés",
    description: "Résumé produit par le modèle, non publiable.",
    factsDate: null,
    court: null,
    charges: [],
    excerpts: [excerpt],
    isNewRevelation: true,
    confidenceScore: 95,
    mentionedNames: ["Jeanne Martin"],
  };

  beforeEach(() => {
    mocks.resolveAffairPolitician.mockResolvedValue({
      judgment: "SAME",
      topCandidateId: "pol-1",
      decisionId: "decision-1",
    });
    mocks.findMatchingAffairs.mockResolvedValue([
      {
        affairId: "aff-existing",
        confidence: "POSSIBLE",
        score: 0.55,
        matchedBy: "evolution-title-overlap",
      },
    ]);
  });

  it("dépose une proposition unique sans créer de brouillon ni relation", async () => {
    const stats = zeroStats();

    await processAnalyzedArticle(
      article,
      `Introduction. ${excerpt} Suite de l’article.`,
      { isAffairRelated: true, summary: "résumé", affairs: [detected] },
      stats,
      { dryRun: false, verbose: false, importRunId: "run-press" }
    );

    expect(mocks.proposeAffairEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        affairId: "aff-existing",
        importRunId: "run-press",
        pressArticleId: "article-evolution",
        resolverDecisionId: "decision-1",
        sourceExcerpt: excerpt,
        confidence: 55,
      })
    );
    expect(mocks.createDraftAffairFromDiscovery).not.toHaveBeenCalled();
    expect(stats.proposalsPending).toBe(1);
  });

  it("charge une fois et transmet le même contexte à plusieurs affaires", async () => {
    const stats = zeroStats();
    const secondDetected = { ...detected, title: "Deuxième évolution" };
    let contextPromise: Promise<AffairResolverContext> | undefined;
    const getResolverContext = (): Promise<AffairResolverContext> =>
      (contextPromise ??= mocks.getResolverContext());

    await processAnalyzedArticle(
      article,
      `Introduction. ${excerpt} Suite de l’article.`,
      { isAffairRelated: true, summary: "résumé", affairs: [detected, secondDetected] },
      stats,
      {
        dryRun: false,
        verbose: false,
        importRunId: "run-press",
        getResolverContext,
      }
    );

    expect(mocks.getResolverContext).toHaveBeenCalledOnce();
    expect(mocks.resolveAffairPolitician).toHaveBeenCalledTimes(2);
    expect(mocks.resolveAffairPolitician.mock.calls[0]![1]).toBe(
      mocks.resolveAffairPolitician.mock.calls[1]![1]
    );
    expect(mocks.resolveAffairPolitician.mock.calls[0]![1]).toBeTruthy();
  });

  it("ne choisit rien lorsqu’un autre candidat POSSIBLE existe", async () => {
    mocks.findMatchingAffairs.mockResolvedValue([
      {
        affairId: "aff-existing",
        confidence: "POSSIBLE",
        score: 0.55,
        matchedBy: "evolution-title-overlap",
      },
      {
        affairId: "aff-other",
        confidence: "POSSIBLE",
        score: 0.5,
        matchedBy: "title-partial",
      },
    ]);
    const stats = zeroStats();

    await processAnalyzedArticle(
      article,
      `Introduction. ${excerpt}`,
      { isAffairRelated: true, summary: "résumé", affairs: [detected] },
      stats,
      { dryRun: false, verbose: false, importRunId: "run-press" }
    );

    expect(mocks.proposeAffairEvent).not.toHaveBeenCalled();
    expect(mocks.createDraftAffairFromDiscovery).toHaveBeenCalledTimes(1);
    expect(stats.ambiguousMatches).toBe(1);
  });

  it("utilise le resolver sans persistance en dry-run", async () => {
    mocks.previewAffairPolitician.mockResolvedValue({
      judgment: "SAME",
      topCandidateId: "pol-1",
      decisionId: null,
    });
    const stats = zeroStats();

    await processAnalyzedArticle(
      article,
      `Introduction. ${excerpt}`,
      { isAffairRelated: true, summary: "résumé", affairs: [detected] },
      stats,
      { dryRun: true, verbose: false }
    );

    expect(mocks.previewAffairPolitician).toHaveBeenCalledTimes(1);
    expect(mocks.resolveAffairPolitician).not.toHaveBeenCalled();
    expect(mocks.proposeAffairEvent).not.toHaveBeenCalled();
    expect(mocks.previewAffairEventProposal).toHaveBeenCalledTimes(1);
    expect(stats.proposalsPending).toBe(0);
    expect(stats.proposalsWouldCreate).toBe(1);
  });

  it.each([
    ["DEDUPED_PENDING", "proposalsDedupedPending"],
    ["DEDUPED_TERMINAL", "proposalsDedupedTerminal"],
    ["ALREADY_APPLIED", "eventsAlreadyApplied"],
  ] as const)("distingue l’issue %s en dry-run", async (outcome, counter) => {
    mocks.previewAffairPolitician.mockResolvedValue({
      judgment: "SAME",
      topCandidateId: "pol-1",
      decisionId: null,
    });
    mocks.previewAffairEventProposal.mockResolvedValue({
      outcome,
      pendingProposalId: outcome.startsWith("DEDUPED") ? "proposal-1" : null,
      deduped: true,
    });
    const stats = zeroStats();

    await processAnalyzedArticle(
      article,
      `Introduction. ${excerpt}`,
      { isAffairRelated: true, summary: "résumé", affairs: [detected] },
      stats,
      { dryRun: true, verbose: false }
    );

    expect(stats[counter]).toBe(1);
    expect(stats.proposalsWouldCreate).toBe(0);
    expect(mocks.createDraftAffairFromDiscovery).not.toHaveBeenCalled();
  });

  it("ne route pas un statut remplacé par le fallback de l’analyse", async () => {
    const stats = zeroStats();

    await processAnalyzedArticle(
      article,
      `Introduction. ${excerpt}`,
      {
        isAffairRelated: true,
        summary: "résumé",
        affairs: [{ ...detected, statusValidated: false }],
      },
      stats,
      { dryRun: false, verbose: false, importRunId: "run-press" }
    );

    expect(mocks.proposeAffairEvent).not.toHaveBeenCalled();
    expect(mocks.createDraftAffairFromDiscovery).toHaveBeenCalledTimes(1);
  });
});

describe("syncPressAnalysis : panne du contexte", () => {
  it("arrête les articles suivants et ne marque pas le premier comme analysé", async () => {
    const first = {
      id: "article-1",
      url: "https://www.lemonde.fr/1",
      title: "Une enquête vise Jeanne Martin",
      description: "Jeanne Martin fait l’objet d’une enquête préliminaire.",
      feedSource: "lemonde",
      publishedAt: new Date("2026-08-27T08:00:00.000Z"),
      mentions: [{ politician: { id: "pol-1", fullName: "Jeanne Martin", slug: "jeanne-martin" } }],
    };
    const second = { ...first, id: "article-2", url: "https://www.lemonde.fr/2" };
    mocks.pressArticleFindMany.mockResolvedValue([first, second]);
    mocks.analyzeArticle.mockResolvedValue({
      isAffairRelated: true,
      summary: "résumé",
      affairs: [
        {
          politicianName: "Jeanne Martin",
          involvement: "DIRECT",
          category: "DETOURNEMENT_FONDS_PUBLICS",
          status: "ENQUETE_PRELIMINAIRE",
          title: "Enquête sur Jeanne Martin",
          description: "Une enquête préliminaire est ouverte.",
          factsDate: null,
          court: null,
          charges: [],
          excerpts: [],
          isNewRevelation: false,
          confidenceScore: 95,
          mentionedNames: ["Jeanne Martin"],
        },
      ],
    });
    mocks.getResolverContext.mockRejectedValue(new Error("database unavailable"));

    await expect(syncPressAnalysis({ force: true })).rejects.toThrow(
      "Impossible de charger le contexte du resolver"
    );

    expect(mocks.analyzeArticle).toHaveBeenCalledOnce();
    expect(mocks.pressArticleUpdate).not.toHaveBeenCalled();
    expect(mocks.markCompleted).not.toHaveBeenCalled();
  });

  it("rejette le lot après un article réussi et laisse le suivant reprenable", async () => {
    const first = {
      id: "article-ok",
      url: "https://www.lemonde.fr/ok",
      title: "Une information politique",
      description: "Aucune procédure n’est évoquée.",
      feedSource: "lemonde",
      publishedAt: new Date("2026-08-27T08:00:00.000Z"),
      mentions: [],
    };
    const second = {
      ...first,
      id: "article-failed",
      url: "https://www.lemonde.fr/failed",
      title: "Une enquête vise Jeanne Martin",
      description: "Jeanne Martin fait l’objet d’une enquête préliminaire.",
      mentions: [{ politician: { id: "pol-1", fullName: "Jeanne Martin", slug: "jeanne-martin" } }],
    };
    mocks.pressArticleFindMany.mockResolvedValue([first, second]);
    mocks.analyzeArticle
      .mockResolvedValueOnce({ isAffairRelated: false, summary: "résumé", affairs: [] })
      .mockResolvedValueOnce({
        isAffairRelated: true,
        summary: "résumé",
        affairs: [
          {
            politicianName: "Jeanne Martin",
            involvement: "DIRECT",
            category: "DETOURNEMENT_FONDS_PUBLICS",
            status: "ENQUETE_PRELIMINAIRE",
            title: "Enquête sur Jeanne Martin",
            description: "Une enquête préliminaire est ouverte.",
            factsDate: null,
            court: null,
            charges: [],
            excerpts: [],
            isNewRevelation: false,
            confidenceScore: 95,
            mentionedNames: ["Jeanne Martin"],
          },
        ],
      });
    mocks.getResolverContext.mockRejectedValue(new Error("database unavailable"));

    await expect(syncPressAnalysis({ force: true })).rejects.toThrow(
      "Impossible de charger le contexte du resolver"
    );

    expect(mocks.analyzeArticle).toHaveBeenCalledTimes(2);
    expect(mocks.pressArticleUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.pressArticleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "article-ok" } })
    );
    expect(mocks.markCompleted).not.toHaveBeenCalled();
  });
});
