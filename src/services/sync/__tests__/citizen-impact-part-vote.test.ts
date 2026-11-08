// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ scrutin: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    scrutin: { findUnique: h.scrutin, findMany: vi.fn(async () => []) },
    vote: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock("@/services/scrutin-policy-title/substance-resolver", () => ({
  resolveSubstanceSources: vi.fn(async () => ({
    substanceDepth: "exposeDesMotifs",
    blocks: [
      {
        sourceType: "dossier",
        sourceId: "d1",
        field: "LegislativeDossier.exposeDesMotifs",
        trust: "official",
        text: "ARTICLE 2 : revaloriser le barème de l'impôt sur le revenu",
      },
    ],
  })),
}));
vi.mock("@/services/scrutin-context-fetcher", () => ({
  fetchScrutinContext: vi.fn(async () => ({
    dossierTitle: "Projet de loi de finances pour 2027",
    dossierSummary: "- Définit le budget national, incluant les impôts et les dépenses.",
    sourcePageText: null,
    dossierSlug: "2026-10-01-projet-de-loi-de-finances-pour-2027",
  })),
}));
vi.mock("@/services/scrutin-substance/debate-context-resolver", () => ({
  resolveDebateContextForScrutin: vi.fn(async () => ({
    usableForGeneration: false,
    reinforced: false,
    context: null,
  })),
}));

import { prepareCitizenImpactInput } from "../generate-scrutin-citizen-impacts";
import { buildUserMessage } from "@/services/scrutin-citizen-impact";

const DECISION_TIMELINE = [
  {
    code: "AN1-DEBATS",
    label: "Discussion",
    date: null,
    chamber: "AN",
    children: [
      {
        code: "AN1-DEBATS-DEC",
        label: "Décision",
        date: "2026-11-04",
        chamber: "AN",
        voteRefs: ["VTANR5L17V9759"],
      },
    ],
  },
];

const PART = {
  id: "s1",
  externalId: "VTANR5L17V9759",
  slug: "s1",
  title: "la première partie du projet de loi de finances pour 2027 (première lecture).",
  summary: "Le projet de loi de finances pour 2027 a été rejeté.",
  theme: "ECONOMIE_BUDGET",
  type: "FINAL",
  result: "REJECTED",
  votesFor: 0,
  votesAgainst: 458,
  votesAbstain: 2,
  chamber: "AN",
  votingDate: new Date("2026-11-04T00:00:00.000Z"),
  sourceUrl: null,
  dossierLegislatifId: "d1",
  dossierLegislatif: { status: "REJETE_NAVETTE", timeline: DECISION_TIMELINE },
  policyTitle: null,
  amendmentLinks: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  h.scrutin.mockResolvedValue(PART);
});

describe("vote sur une partie du texte", () => {
  it("ne reçoit ni l'exposé des motifs ni le résumé du dossier entier", async () => {
    const prepared = (await prepareCitizenImpactInput("s1"))!;
    expect(prepared.input.substanceBlocks).toEqual([]);
    expect(prepared.input.substanceDepth).toBeNull();
    expect(prepared.input.dossierSummary).toBeNull();
    const prompt = buildUserMessage(prepared.input);
    expect(prompt).not.toContain("barème de l'impôt sur le revenu");
    expect(prompt).not.toContain("incluant les impôts et les dépenses");
  });

  it("transmet la suite officielle quand le dossier est rejeté mais poursuivi", async () => {
    const prepared = (await prepareCitizenImpactInput("s1"))!;
    expect(prepared.input.procedureFact).toContain("transmis au Sénat");
  });

  it("ne transmet aucune suite quand le statut du dossier ne l'établit pas", async () => {
    h.scrutin.mockResolvedValue({
      ...PART,
      dossierLegislatif: { status: "EN_COURS", timeline: DECISION_TIMELINE },
    });
    const prepared = (await prepareCitizenImpactInput("s1"))!;
    expect(prepared.input.procedureFact).toBeNull();
  });

  it("ne transmet aucune suite pour une autre partie du même dossier, que la décision ne cite pas (Codex P1)", async () => {
    h.scrutin.mockResolvedValue({ ...PART, externalId: "VTANR5L17V9000" });
    const prepared = (await prepareCitizenImpactInput("s1"))!;
    expect(prepared.input.procedureFact).toBeNull();
  });

  it("garde l'exposé des motifs pour un vote sur le texte entier", async () => {
    h.scrutin.mockResolvedValue({
      ...PART,
      title: "l'ensemble du projet de loi de finances pour 2027",
    });
    const prepared = (await prepareCitizenImpactInput("s1"))!;
    expect(prepared.input.substanceBlocks).toHaveLength(1);
    expect(prepared.input.dossierSummary).toContain("budget national");
  });
});
