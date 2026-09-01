import { beforeEach, describe, expect, it, vi } from "vitest";

const callMistralMock = vi.fn();

const dbMock = {
  candidacy: { findUnique: vi.fn() },
  mandate: { findMany: vi.fn() },
  vote: { count: vi.fn() },
  measure: { findMany: vi.fn() },
  candidacyPresidential: { update: vi.fn() },
  auditLog: { create: vi.fn() },
};

vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/api/mistral", () => ({
  callMistral: (...args: unknown[]) => callMistralMock(...args),
  extractMistralText: (response: { text: string }) => response.text,
  parseMistralJSON: (text: string) => JSON.parse(text),
}));

const CAREER = Array.from({ length: 35 }, (_, index) => `parcours${index}`).join(" ");
const PROGRAMME_AXIS =
  "Le programme relie la réouverture de maternités de proximité au rétablissement de dessertes ferroviaires nocturnes pour rapprocher plusieurs services essentiels.";

function providerOutput(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    career: `${CAREER}.`,
    programmeClaims: [{ text: PROGRAMME_AXIS, measureRefs: ["M1", "M2"] }],
    ...over,
  });
}

function groundingOutput(supported = true): string {
  return JSON.stringify({
    claims: [{ index: 0, supported, reason: supported ? "Étayer par M1 et M2." : "Ajout absent." }],
  });
}

const CANDIDACY = {
  id: "cand-1",
  candidateName: "Alix Démonstration",
  partyLabel: "Parti de démonstration",
  politicianId: "pol-1",
  status: "DECLARE",
  electionId: "elec-1",
  party: null,
  presidentialData: { id: "pres-1" },
};

async function service() {
  return import("../index");
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.candidacy.findUnique.mockResolvedValue(CANDIDACY);
  dbMock.mandate.findMany.mockResolvedValue([]);
  dbMock.vote.count.mockResolvedValue(0);
  dbMock.measure.findMany.mockResolvedValue([
    { theme: "SANTE", publishedRevision: { text: "Rouvrir des maternités de proximité." } },
    {
      theme: "TRANSPORTS",
      publishedRevision: { text: "Rétablir des trains de nuit sur six lignes." },
    },
  ]);
  dbMock.candidacyPresidential.update.mockResolvedValue({ id: "pres-1" });
  dbMock.auditLog.create.mockResolvedValue({ id: "audit-1" });
  callMistralMock.mockImplementation((messages: Array<{ content: string }>) => {
    const grounding = messages.some((message) =>
      message.content.includes("Vérifie si chaque affirmation")
    );
    return Promise.resolve({
      text: grounding ? groundingOutput() : providerOutput(),
      model: "mistral-large-latest",
    });
  });
});

describe("generateCandidateSynthesis", () => {
  it("écrit une synthèse du programme et sa date sur l'extension présidentielle", async () => {
    const { generateCandidateSynthesis } = await service();
    const result = await generateCandidateSynthesis("cand-1", { persist: true });

    expect(result).toMatchObject({
      ok: true,
      provider: "mistral-large-latest",
      measureCount: 2,
    });
    const write = dbMock.candidacyPresidential.update.mock.calls[0]![0];
    expect(write.where).toEqual({ id: "pres-1" });
    expect(write.data.synthesis).toContain("Le programme relie");
    expect(write.data.synthesis).not.toContain("thèmes suivants");
    expect(write.data.synthesisGeneratedAt).toBeInstanceOf(Date);
    expect(dbMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          changes: expect.objectContaining({ programmeClaimCount: 1 }),
        }),
      })
    );
  });

  it("n'écrit rien en dry run", async () => {
    const { generateCandidateSynthesis } = await service();
    const result = await generateCandidateSynthesis("cand-1", { persist: false });

    expect(result).toMatchObject({ ok: true, persisted: false });
    expect(dbMock.candidacyPresidential.update).not.toHaveBeenCalled();
    expect(dbMock.auditLog.create).not.toHaveBeenCalled();
  });

  it("utilise Mistral avec une sortie JSON déterministe", async () => {
    const { generateCandidateSynthesis } = await service();
    await generateCandidateSynthesis("cand-1", { persist: false });

    expect(callMistralMock.mock.calls[0]![1]).toMatchObject({
      model: "mistral-large-latest",
      temperature: 0,
      responseFormat: { type: "json_object" },
    });
  });

  it("refuse une candidature qui n'est pas déclarée", async () => {
    dbMock.candidacy.findUnique.mockResolvedValue({ ...CANDIDACY, status: "PRESSENTI" });
    const { generateCandidateSynthesis } = await service();
    const result = await generateCandidateSynthesis("cand-1", { persist: true });

    expect(result).toMatchObject({ ok: false, reason: "non_declaree" });
    expect(callMistralMock).not.toHaveBeenCalled();
  });

  it("refuse d'inventer l'extension présidentielle manquante", async () => {
    dbMock.candidacy.findUnique.mockResolvedValue({ ...CANDIDACY, presidentialData: null });
    const { generateCandidateSynthesis } = await service();
    const result = await generateCandidateSynthesis("cand-1", { persist: true });

    expect(result).toMatchObject({ ok: false, reason: "sans_extension" });
    expect(dbMock.candidacyPresidential.update).not.toHaveBeenCalled();
  });

  it("retourne une erreur de génération quand Mistral échoue", async () => {
    callMistralMock.mockRejectedValue(new Error("429"));
    const { generateCandidateSynthesis } = await service();
    const result = await generateCandidateSynthesis("cand-1", { persist: true });

    expect(result).toMatchObject({
      ok: false,
      reason: "generation",
      message: "Mistral reste indisponible après trois essais : 429",
    });
    expect(callMistralMock).toHaveBeenCalledTimes(3);
    expect(dbMock.candidacyPresidential.update).not.toHaveBeenCalled();
  });

  it("réessaie une réponse JSON invalide en fournissant le brouillon au modèle", async () => {
    callMistralMock
      .mockResolvedValueOnce({ text: "pas du json", model: "mistral-large-latest" })
      .mockResolvedValueOnce({ text: providerOutput(), model: "mistral-large-latest" })
      .mockResolvedValueOnce({ text: groundingOutput(), model: "mistral-large-latest" });
    const { generateCandidateSynthesis } = await service();
    const result = await generateCandidateSynthesis("cand-1", { persist: true });

    expect(result).toMatchObject({ ok: true });
    expect(callMistralMock).toHaveBeenCalledTimes(3);
    const retryMessages = callMistralMock.mock.calls[1]![0] as Array<{
      role: string;
      content: string;
    }>;
    expect(retryMessages).toContainEqual({ role: "assistant", content: "pas du json" });
    expect(retryMessages.at(-1)?.content).toContain("réponse JSON est invalide");
  });

  it("réessaie une synthèse que le contrôle d'étayage refuse", async () => {
    callMistralMock
      .mockResolvedValueOnce({ text: providerOutput(), model: "mistral-large-latest" })
      .mockResolvedValueOnce({ text: groundingOutput(false), model: "mistral-large-latest" })
      .mockResolvedValueOnce({ text: providerOutput(), model: "mistral-large-latest" })
      .mockResolvedValueOnce({ text: groundingOutput(true), model: "mistral-large-latest" });
    const { generateCandidateSynthesis } = await service();
    const result = await generateCandidateSynthesis("cand-1", { persist: true });

    expect(result).toMatchObject({ ok: true });
    expect(callMistralMock).toHaveBeenCalledTimes(4);
    const retryMessages = callMistralMock.mock.calls[2]![0] as Array<{ content: string }>;
    expect(retryMessages.at(-1)?.content).toContain("contrôle d'étayage refusé");
  });

  it("ne stocke rien quand deux réponses sont refusées", async () => {
    callMistralMock.mockResolvedValue({
      text: JSON.stringify({ career: `${CAREER}.`, programmeClaims: [] }),
      model: "mistral-large-latest",
    });
    const { generateCandidateSynthesis } = await service();
    const result = await generateCandidateSynthesis("cand-1", { persist: true });

    expect(result).toMatchObject({ ok: false, reason: "refuse" });
    expect(callMistralMock).toHaveBeenCalledTimes(3);
    expect(dbMock.candidacyPresidential.update).not.toHaveBeenCalled();
  });

  it("gère un programme vide sans lancer de contrôle d'étayage", async () => {
    dbMock.measure.findMany.mockResolvedValue([]);
    callMistralMock.mockResolvedValue({
      text: JSON.stringify({ career: `${CAREER}.`, programmeClaims: [] }),
      model: "mistral-large-latest",
    });
    const { generateCandidateSynthesis } = await service();
    const result = await generateCandidateSynthesis("cand-1", { persist: true });

    expect(result).toMatchObject({ ok: true, measureCount: 0 });
    expect(callMistralMock).toHaveBeenCalledTimes(1);
    expect(dbMock.candidacyPresidential.update.mock.calls[0]![0].data.synthesis).toContain(
      "Aucune mesure n'est publiée"
    );
  });
});
