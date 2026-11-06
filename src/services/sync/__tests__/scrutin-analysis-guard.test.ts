import { describe, it, expect, beforeEach, vi } from "vitest";
// @vitest-environment node
import type { SubstanceTextBlock } from "@/services/scrutin-policy-title/types";

// Controlled DB + Mistral + substance-resolver mocks: no real database, no network.
const scrutinFindMany = vi.fn();
const markCompleted = vi.fn();
vi.mock("@/lib/sync/sync-metadata", () => ({
  syncMetadata: {
    get: vi.fn(async () => null),
    markCompleted: (...a: unknown[]) => markCompleted(...a),
  },
}));
const analysisUpsert = vi.fn();
const sourceLock = vi.fn();
const analysisFindMany = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ $queryRaw: sourceLock, scrutinAnalysis: { upsert: analysisUpsert } }),
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
import { AMENDMENT_VOTE_LINKED_OR_OTHER_WHERE } from "@/services/scrutin-substance/amendment-vote-guard";

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
  // Each sentence stays on the cited paragraph (see the support check).
  argumentsFor:
    "Mme Léchon estime que la publication de la répartition des revenus des coopératives donne plus de transparence.",
  argumentsAgainst:
    "M. Y juge que cette publication des revenus représente une charge pour les petites coopératives.",
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
    votingDate: new Date("2026-05-30"),
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

const discussion = {
  common: false,
  amendmentNumbers: ["2084"],
  paragraphs: [
    {
      id: "p1",
      speaker: "Mme Léchon",
      actorRef: "PA1",
      role: null,
      article: "22",
      amendments: ["2084"],
      subAmendments: [],
      textNumber: "123",
      scope: "target",
      text: "La publication de la répartition des revenus des coopératives donne plus de transparence.",
    },
    {
      id: "p2",
      speaker: "M. Y",
      actorRef: "PA2",
      role: null,
      article: "22",
      amendments: ["2084"],
      subAmendments: [],
      textNumber: "123",
      scope: "target",
      text: "Cette publication des revenus représente une charge pour les petites coopératives.",
    },
  ],
};
function setMistral(args: { argumentsFor: string; argumentsAgainst: string }) {
  callMistral.mockResolvedValue({});
  extractMistralText.mockReturnValue("{}");
  parseMistralJSON.mockReturnValue({
    ...args,
    evidenceFor: args.argumentsFor
      ? [{ paragraphId: "p1", quote: discussion.paragraphs[0]!.text, scope: "target" }]
      : [],
    evidenceAgainst: args.argumentsAgainst
      ? [{ paragraphId: "p2", quote: discussion.paragraphs[1]!.text, scope: "target" }]
      : [],
  });
}

beforeEach(() => {
  scrutinFindMany.mockReset();
  scrutinFindMany.mockResolvedValue([]);
  markCompleted.mockReset();
  sourceLock.mockReset();
  sourceLock.mockResolvedValue([{ id: "transcript1" }]);
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
    discussion,
    sourceHash: "hash",
    sourceUrl: "https://www.assemblee-nationale.fr/source",
    transcriptSeanceRef: "RU1",
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
    scrutinFindMany.mockResolvedValueOnce([keyVoteScrutin("DEBUT_DE_SEANCE sans rapport")]);

    const res = await generateScrutinAnalysis({ limit: 10 });

    expect(callMistral).not.toHaveBeenCalled();
    expect(analysisUpsert).not.toHaveBeenCalled();
    expect(res.skipped).toBeGreaterThanOrEqual(1);
  });

  it("skips an uncorroborated match even when the resolver calls it usable", async () => {
    resolveDebate.mockResolvedValue({ usableForGeneration: true, reinforced: false, context: "x" });
    scrutinFindMany.mockResolvedValueOnce([keyVoteScrutin("DEBUT_DE_SEANCE sans rapport")]);

    await generateScrutinAnalysis({ limit: 10 });

    expect(callMistral).not.toHaveBeenCalled();
  });

  it("feeds an amendment vote the passage on that amendment, not the start of the séance", async () => {
    scrutinFindMany.mockResolvedValueOnce([keyVoteScrutin("DEBUT_DE_SEANCE sans rapport")]);
    setMistral(COHERENT_ARGS);

    await generateScrutinAnalysis({ limit: 10 });

    const prompt = (callMistral.mock.calls[0]![0] as { content: string }[])[0]!.content;
    expect(prompt).toContain("publication de la répartition");
    expect(prompt).not.toContain("DEBUT_DE_SEANCE");
  });

  it("skips a scrutin with no usable debate transcript: no resolver, no model, no write", async () => {
    scrutinFindMany.mockResolvedValueOnce([
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
    scrutinFindMany.mockResolvedValueOnce([
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
    scrutinFindMany.mockResolvedValueOnce([keyVoteScrutin("Débat réel sur la transparence.")]);
    setMistral(COHERENT_ARGS);

    const res = await generateScrutinAnalysis({ limit: 10 });

    expect(analysisUpsert).toHaveBeenCalledTimes(1);
    expect(res.generated).toBe(1);
  });

  it("does not fall back to a legacy whole-séance transcript for a non-amendment vote", async () => {
    scrutinFindMany.mockResolvedValueOnce([
      keyVoteScrutin("Débat réel en séance sur l'ensemble du texte.", {
        amendmentLinked: false,
        title: "l'ensemble du projet de loi d'urgence agricole (première lecture).",
      }),
    ]);
    resolveSubstanceSources.mockResolvedValue({ blocks: [], substanceDepth: null, warnings: [] });
    setMistral(DEBATE_ARGS);

    const res = await generateScrutinAnalysis({ limit: 10 });

    resolveDebate.mockResolvedValueOnce({ usableForGeneration: false });
    // Real DB candidates exclude non-amendment votes; a legacy link alone has no authority.
    expect(res.skippedIncoherent).toBe(0);
  });

  it("never calls the model for an amendment vote whose amendment is not linked (V9336)", async () => {
    scrutinFindMany.mockResolvedValueOnce([
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
  it("does not call the model when the debate is not about the official measure", async () => {
    resolveDebate.mockResolvedValue({
      usableForGeneration: true,
      discussion: {
        ...discussion,
        paragraphs: discussion.paragraphs.map((p) => ({
          ...p,
          text: "Les importations de produits à bas prix ne respectent pas les normes sociales et environnementales.",
        })),
      },
      sourceHash: "hash",
      sourceUrl: "https://www.assemblee-nationale.fr/source",
      transcriptSeanceRef: "RU1",
      reinforced: true,
      context: "x",
    });
    scrutinFindMany.mockResolvedValueOnce([keyVoteScrutin("Débat de séance, sujets variés.")]);
    setMistral(COHERENT_ARGS);

    const res = await generateScrutinAnalysis({ limit: 10 });

    expect(callMistral).not.toHaveBeenCalled();
    expect(analysisUpsert).not.toHaveBeenCalled();
    expect(res.skippedIncoherent).toBe(1);
  });

  it("does NOT persist arguments that drift from the cited quotes (import-ban vs cooperatives)", async () => {
    scrutinFindMany.mockResolvedValueOnce([keyVoteScrutin("Débat de séance, sujets variés.")]);
    setMistral(INCOHERENT_ARGS);

    const res = await generateScrutinAnalysis({ limit: 10 });

    expect(analysisUpsert).not.toHaveBeenCalled();
    expect(res.generated).toBe(0);
    expect(res.errors.some((e) => e.includes("not covered by their citations"))).toBe(true);
  });

  it("persists a faithful summary that does not repeat the measure's vocabulary", async () => {
    scrutinFindMany.mockResolvedValueOnce([keyVoteScrutin("Débat de séance, sujets variés.")]);
    setMistral({
      argumentsFor: "Mme Léchon estime que cela donne plus de transparence.",
      argumentsAgainst: "",
    });

    const res = await generateScrutinAnalysis({ limit: 10 });

    expect(res.generated).toBe(1);
    expect(res.skippedIncoherent).toBe(0);
  });

  it("dryRun never writes", async () => {
    scrutinFindMany.mockResolvedValueOnce([keyVoteScrutin("Débat réel sur la transparence.")]);
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

  it("keeps refused article votes out of the candidate query, so they cannot fill every batch", async () => {
    scrutinFindMany.mockResolvedValueOnce([]);

    await generateScrutinAnalysis({ limit: 5 });

    const where = scrutinFindMany.mock.calls[0]![0].where;
    expect(where.AND).toContainEqual(AMENDMENT_VOTE_LINKED_OR_OTHER_WHERE);
  });
});

describe("evidence and bounded scan", () => {
  it("gets past newer refusals to an older usable debate without spending an extra model call", async () => {
    const first = keyVoteScrutin(null);
    const second = { ...keyVoteScrutin(null), id: "s2" };
    scrutinFindMany.mockResolvedValueOnce([first, second]);
    resolveDebate.mockResolvedValueOnce({ usableForGeneration: false });
    setMistral(COHERENT_ARGS);
    const result = await generateScrutinAnalysis({ limit: 1 });
    expect(result.generated).toBe(1);
    expect(callMistral).toHaveBeenCalledTimes(1);
    expect(markCompleted).toHaveBeenCalledWith(expect.any(String), {
      cursor: expect.stringContaining("s2"),
    });
    expect(analysisUpsert.mock.calls[0]![0].create.evidence).toMatchObject({
      sourceHash: "hash",
      seanceRef: "RU1",
      for: [{ paragraphId: "p1", quote: expect.any(String), scope: "target" }],
    });
  });
  it("never persists invented citations", async () => {
    scrutinFindMany.mockResolvedValueOnce([keyVoteScrutin(null)]);
    setMistral(COHERENT_ARGS);
    parseMistralJSON.mockReturnValue({
      ...COHERENT_ARGS,
      evidenceFor: [
        { paragraphId: "p1", quote: "Une citation inventée sans aucun rapport", scope: "target" },
      ],
      evidenceAgainst: [],
    });
    const result = await generateScrutinAnalysis({ limit: 1 });
    expect(result.generated).toBe(0);
    expect(analysisUpsert).not.toHaveBeenCalled();
  });
  it("refuses sentences that go beyond their cited quotes (amendment 2127 failure)", async () => {
    scrutinFindMany.mockResolvedValueOnce([keyVoteScrutin(null)]);
    // Real quotes, but the generated text adds claims the speakers never made.
    setMistral({
      argumentsFor:
        "La publication de la répartition des revenus des coopératives réduirait les dépenses de santé et protégerait la biodiversité marine.",
      argumentsAgainst: COHERENT_ARGS.argumentsAgainst,
    });
    const result = await generateScrutinAnalysis({ limit: 1 });
    expect(result.generated).toBe(0);
    expect(result.errors).toContain("s1: sentences not covered by their citations");
    expect(analysisUpsert).not.toHaveBeenCalled();
  });
  it("allows one documented side without inventing an opposing argument", async () => {
    scrutinFindMany.mockResolvedValueOnce([keyVoteScrutin(null)]);
    setMistral({ argumentsFor: COHERENT_ARGS.argumentsFor, argumentsAgainst: "" });
    const result = await generateScrutinAnalysis({ limit: 1 });
    expect(result.generated).toBe(1);
    expect(analysisUpsert.mock.calls[0]![0].create.argumentsAgainst).toBe("");
  });
  it("qualifies shared arguments visibly", async () => {
    scrutinFindMany.mockResolvedValueOnce([keyVoteScrutin(null)]);
    resolveDebate.mockResolvedValue({
      usableForGeneration: true,
      sourceHash: "hash",
      sourceUrl: "https://www.assemblee-nationale.fr/source",
      discussion: {
        ...discussion,
        common: true,
        paragraphs: discussion.paragraphs.map((p) => ({ ...p, scope: "shared" })),
      },
    });
    setMistral(COHERENT_ARGS);
    parseMistralJSON.mockReturnValue({
      ...COHERENT_ARGS,
      evidenceFor: [{ paragraphId: "p1", quote: discussion.paragraphs[0]!.text, scope: "shared" }],
      evidenceAgainst: [
        { paragraphId: "p2", quote: discussion.paragraphs[1]!.text, scope: "shared" },
      ],
    });
    const result = await generateScrutinAnalysis({ limit: 1 });
    expect(result.generated).toBe(1);
    expect(analysisUpsert.mock.calls[0]![0].create.argumentsFor).toMatch(
      /^Dans la discussion commune/
    );
  });
});

it("does not persist if the source changed while the model was running", async () => {
  scrutinFindMany.mockResolvedValueOnce([keyVoteScrutin(null)]);
  setMistral(COHERENT_ARGS);
  sourceLock.mockResolvedValue([]);
  const result = await generateScrutinAnalysis({ limit: 1 });
  expect(result.generated).toBe(0);
  expect(analysisUpsert).not.toHaveBeenCalled();
});
