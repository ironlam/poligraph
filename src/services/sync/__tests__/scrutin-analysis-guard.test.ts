import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SubstanceTextBlock } from "@/services/scrutin-policy-title/types";

// Controlled DB + Mistral + substance-resolver mocks: no real database, no network.
const scrutinFindMany = vi.fn();
const analysisUpsert = vi.fn();
const analysisFindMany = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    scrutin: { findMany: (...a: unknown[]) => scrutinFindMany(...a) },
    scrutinAnalysis: {
      upsert: (...a: unknown[]) => analysisUpsert(...a),
      findMany: (...a: unknown[]) => analysisFindMany(...a),
    },
  },
}));

const callMistral = vi.fn();
const extractMistralText = vi.fn();
const parseMistralJSON = vi.fn();
vi.mock("@/lib/api/mistral", () => ({
  callMistral: (...a: unknown[]) => callMistral(...a),
  extractMistralText: (...a: unknown[]) => extractMistralText(...a),
  parseMistralJSON: (...a: unknown[]) => parseMistralJSON(...a),
}));

const resolveSubstanceSources = vi.fn();
vi.mock("@/services/scrutin-policy-title/substance-resolver", () => ({
  resolveSubstanceSources: (...a: unknown[]) => resolveSubstanceSources(...a),
}));

const resolveDebate = vi.fn();
vi.mock("@/services/scrutin-substance/debate-context-resolver", () => ({
  resolveDebateContextForScrutin: (...a: unknown[]) => resolveDebate(...a),
}));

import { generateScrutinAnalysis, auditScrutinAnalysisCoherence } from "../scrutin-analysis";

const COOP_BLOCKS: SubstanceTextBlock[] = [
  {
    sourceType: "amendment",
    sourceId: "amd-2084",
    field: "Amendment.content",
    text: "Les sociétés coopératives agricoles publient la répartition de la valeur et la part redistribuée aux associés coopérateurs.",
    trust: "official",
    meta: { amendmentNumber: "2084", articleRef: "APRÈS L'ARTICLE 22" },
  },
];

const POLICY_TITLE = "Obliger les coopératives agricoles à publier la répartition de leurs revenus";

const COHERENT_ARGS = {
  argumentsFor:
    "Les partisans voulaient obliger les coopératives agricoles à publier la répartition de leurs revenus, pour plus de transparence.",
  argumentsAgainst:
    "Les opposants jugeaient cette obligation de publication trop lourde pour les petites coopératives.",
};

// scrutin-2084 failure mode: arguments about an import ban, absent from the amendment.
const INCOHERENT_ARGS = {
  argumentsFor:
    "Les partisans voulaient interdire les importations de produits agricoles à bas prix ne respectant pas les normes sociales et environnementales.",
  argumentsAgainst: "Les opposants craignaient des représailles commerciales.",
};

// Generic valid arguments (used for non-amendment votes, where there is no
// official reference to gate against).
const DEBATE_ARGS = {
  argumentsFor: "Les partisans, lors du débat, ont défendu la mesure présentée en séance.",
  argumentsAgainst: "Les opposants ont exprimé leurs réserves pendant la discussion.",
};

function keyVoteScrutin(
  debate: string | null,
  opts?: { amendmentLinked?: boolean; title?: string }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  return {
    id: "s1",
    type: null,
    title: opts?.title ?? "l'amendement n° 2084 de Mme Lechon après l'article 22 ...",
    result: "REJECTED",
    votesFor: 37,
    votesAgainst: 38,
    votesAbstain: 2,
    groupPositions: [
      {
        group: { name: "Rassemblement National", code: "RN" },
        position: "POUR",
        forCount: 34,
        againstCount: 0,
        abstainCount: 0,
      },
    ],
    debateTranscripts: debate ? [{ content: debate }] : [],
    dossierLegislatif: { title: "Projet de loi d'urgence agricole" },
    amendmentLinks: opts?.amendmentLinked === false ? [] : [{ amendmentId: "amd-2084" }],
    policyTitle:
      opts?.amendmentLinked === false ? null : { policyTitle: POLICY_TITLE, policySubtitle: null },
  };
}

function setMistral(args: { argumentsFor: string; argumentsAgainst: string }) {
  callMistral.mockResolvedValue({});
  extractMistralText.mockReturnValue("{}");
  parseMistralJSON.mockReturnValue(args);
}

beforeEach(() => {
  scrutinFindMany.mockReset();
  analysisUpsert.mockReset();
  analysisFindMany.mockReset();
  callMistral.mockReset();
  extractMistralText.mockReset();
  parseMistralJSON.mockReset();
  resolveSubstanceSources.mockReset();
  resolveDebate.mockReset();
  // Default: the resolver finds an explicit, corroborated passage on the amendment.
  resolveDebate.mockResolvedValue({
    usableForGeneration: true,
    reinforced: true,
    context: "Passage de débat sur l'amendement : M. X défend, Mme Y s'oppose.",
  });
  resolveSubstanceSources.mockResolvedValue({
    blocks: COOP_BLOCKS,
    substanceDepth: "amendment",
    warnings: [],
  });
});

describe("generateScrutinAnalysis — no-debate guard", () => {
  it("skips an amendment vote the resolver cannot tie to a debate: no model, no write", async () => {
    resolveDebate.mockResolvedValue({
      usableForGeneration: false,
      reinforced: false,
      context: null,
    });
    scrutinFindMany.mockResolvedValue([keyVoteScrutin("DEBUT_DE_SEANCE sans rapport")]);

    const res = await generateScrutinAnalysis({ limit: 10 });

    expect(callMistral).not.toHaveBeenCalled();
    expect(analysisUpsert).not.toHaveBeenCalled();
    expect(res.skipped).toBeGreaterThanOrEqual(1);
  });

  it("skips an uncorroborated match even when the resolver calls it usable", async () => {
    resolveDebate.mockResolvedValue({ usableForGeneration: true, reinforced: false, context: "x" });
    scrutinFindMany.mockResolvedValue([keyVoteScrutin("DEBUT_DE_SEANCE sans rapport")]);

    await generateScrutinAnalysis({ limit: 10 });

    expect(callMistral).not.toHaveBeenCalled();
  });

  it("feeds an amendment vote the passage on that amendment, not the start of the séance", async () => {
    scrutinFindMany.mockResolvedValue([keyVoteScrutin("DEBUT_DE_SEANCE sans rapport")]);
    setMistral(COHERENT_ARGS);

    await generateScrutinAnalysis({ limit: 10 });

    const prompt = (callMistral.mock.calls[0]![0] as { content: string }[])[0]!.content;
    expect(prompt).toContain("M. X défend");
    expect(prompt).not.toContain("DEBUT_DE_SEANCE");
  });

  it("skips a scrutin with no usable debate transcript: no resolver, no model, no write", async () => {
    scrutinFindMany.mockResolvedValue([
      keyVoteScrutin(null, {
        amendmentLinked: false,
        title: "l'ensemble du projet de loi (première lecture).",
      }),
    ]);

    const res = await generateScrutinAnalysis({ limit: 10 });

    expect(resolveSubstanceSources).not.toHaveBeenCalled();
    expect(callMistral).not.toHaveBeenCalled();
    expect(analysisUpsert).not.toHaveBeenCalled();
    expect(res.generated).toBe(0);
    expect(res.skipped).toBeGreaterThanOrEqual(1);
  });
});

describe("generateScrutinAnalysis — substance anchoring", () => {
  it("feeds the official amendment substance into the prompt (sujet-officiel)", async () => {
    scrutinFindMany.mockResolvedValue([
      keyVoteScrutin("M. X a défendu la transparence ; Mme Y s'y est opposée."),
    ]);
    setMistral(COHERENT_ARGS);

    await generateScrutinAnalysis({ limit: 10 });

    expect(callMistral).toHaveBeenCalledTimes(1);
    const prompt = (callMistral.mock.calls[0]![0] as { content: string }[])[0]!.content;
    expect(prompt).toContain("<sujet-officiel>");
    expect(prompt).toContain("coopératives agricoles");
  });

  it("persists when the generated arguments are coherent with the amendment", async () => {
    scrutinFindMany.mockResolvedValue([keyVoteScrutin("Débat réel sur la transparence.")]);
    setMistral(COHERENT_ARGS);

    const res = await generateScrutinAnalysis({ limit: 10 });

    expect(analysisUpsert).toHaveBeenCalledTimes(1);
    expect(res.generated).toBe(1);
  });

  it("generates a non-amendment-linked vote from the debate alone (no substance, no coherence gate)", async () => {
    scrutinFindMany.mockResolvedValue([
      keyVoteScrutin("Débat réel en séance sur l'ensemble du texte.", {
        amendmentLinked: false,
        title: "l'ensemble du projet de loi d'urgence agricole (première lecture).",
      }),
    ]);
    resolveSubstanceSources.mockResolvedValue({ blocks: [], substanceDepth: null, warnings: [] });
    setMistral(DEBATE_ARGS);

    const res = await generateScrutinAnalysis({ limit: 10 });

    expect(analysisUpsert).toHaveBeenCalledTimes(1);
    expect(res.generated).toBe(1);
    expect(res.skippedIncoherent).toBe(0);
  });

  it("never calls the model for an amendment vote whose amendment is not linked (V9336)", async () => {
    scrutinFindMany.mockResolvedValue([
      keyVoteScrutin("Débat de séance sur la loi de finances.", { amendmentLinked: false }),
    ]);
    resolveSubstanceSources.mockResolvedValue({
      blocks: [],
      substanceDepth: "exposeDesMotifs",
      warnings: [],
    });
    setMistral(DEBATE_ARGS);

    const res = await generateScrutinAnalysis({ limit: 10 });

    expect(callMistral).not.toHaveBeenCalled();
    expect(analysisUpsert).not.toHaveBeenCalled();
    expect(res.skipped).toBe(1);
  });
});

describe("generateScrutinAnalysis — coherence guard (scrutin 2084 regression)", () => {
  it("does NOT persist arguments incoherent with the amendment (import-ban vs cooperatives)", async () => {
    scrutinFindMany.mockResolvedValue([keyVoteScrutin("Débat de séance, sujets variés.")]);
    setMistral(INCOHERENT_ARGS);

    const res = await generateScrutinAnalysis({ limit: 10 });

    expect(analysisUpsert).not.toHaveBeenCalled();
    expect(res.generated).toBe(0);
    expect(res.skippedIncoherent).toBe(1);
  });

  it("dryRun never writes", async () => {
    scrutinFindMany.mockResolvedValue([keyVoteScrutin("Débat réel sur la transparence.")]);
    setMistral(COHERENT_ARGS);

    await generateScrutinAnalysis({ limit: 10, dryRun: true });

    expect(analysisUpsert).not.toHaveBeenCalled();
  });
});

describe("auditScrutinAnalysisCoherence — read-only report", () => {
  it("flags at-risk analyses without writing", async () => {
    analysisFindMany.mockResolvedValue([
      {
        argumentsFor: INCOHERENT_ARGS.argumentsFor,
        argumentsAgainst: INCOHERENT_ARGS.argumentsAgainst,
        sourceType: "STRUCTURED_DATA",
        scrutin: {
          id: "s1",
          slug: "s1-slug",
          title: "l'amendement n° 2084 ...",
          policyTitle: { policyTitle: POLICY_TITLE, policySubtitle: null },
          _count: { debateTranscripts: 0 },
        },
      },
    ]);

    const report = await auditScrutinAnalysisCoherence({ limit: 50 });

    expect(analysisUpsert).not.toHaveBeenCalled();
    expect(report.scanned).toBe(1);
    expect(report.atRisk).toHaveLength(1);
    expect(report.atRisk[0]!.sourceType).toBe("STRUCTURED_DATA");
    expect(report.atRisk[0]!.hasDebate).toBe(false);
    expect(report.atRisk[0]!.coverage).toBeLessThan(0.3);
  });
});
