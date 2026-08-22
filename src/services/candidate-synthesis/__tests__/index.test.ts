import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The generation shared by the script and the admin button.
 *
 * What is worth pinning here is not the prompt (tested pure in
 * `@/lib/presidentielle/candidate-synthesis`) but the decisions this module owns: which candidacies
 * may carry a synthesis at all, what a dry run must NOT write, when the second provider is tried,
 * and that a screened-out text is never stored.
 */

const callAnthropicMock = vi.fn();
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
vi.mock("@/lib/api/anthropic", () => ({
  callAnthropic: (...args: unknown[]) => callAnthropicMock(...args),
}));
vi.mock("@/lib/api/mistral", () => ({
  callMistral: (...args: unknown[]) => callMistralMock(...args),
  extractMistralText: (response: { text: string }) => response.text,
}));

/** A text that clears every rule of `screenSynthesis`: no long dash, no judicial term, 90+ words. */
const ACCEPTED = `${Array.from({ length: 120 }, (_, i) => `mot${i}`).join(" ")}.`;

function anthropicText(text: string) {
  return { content: [{ type: "text", text }] };
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
  ]);
  dbMock.candidacyPresidential.update.mockResolvedValue({ id: "pres-1" });
  dbMock.auditLog.create.mockResolvedValue({ id: "audit-1" });
  callAnthropicMock.mockResolvedValue(anthropicText(ACCEPTED));
});

describe("generateCandidateSynthesis", () => {
  it("écrit le texte et sa date sur l'extension présidentielle", async () => {
    const { generateCandidateSynthesis } = await service();

    const result = await generateCandidateSynthesis("cand-1", { persist: true });

    expect(result).toMatchObject({ ok: true, provider: "anthropic", measureCount: 1 });
    const write = dbMock.candidacyPresidential.update.mock.calls[0]![0];
    expect(write.where).toEqual({ id: "pres-1" });
    expect(write.data.synthesis).toBe(ACCEPTED);
    expect(write.data.synthesisGeneratedAt).toBeInstanceOf(Date);
    expect(dbMock.auditLog.create).toHaveBeenCalled();
  });

  it("n'écrit rien en dry run", async () => {
    // Le mode par défaut du script : imprimer ce qui SERAIT stocké.
    const { generateCandidateSynthesis } = await service();

    const result = await generateCandidateSynthesis("cand-1", { persist: false });

    expect(result).toMatchObject({ ok: true, persisted: false });
    expect(dbMock.candidacyPresidential.update).not.toHaveBeenCalled();
    expect(dbMock.auditLog.create).not.toHaveBeenCalled();
  });

  it("refuse une candidature qui n'est pas déclarée", async () => {
    // Une candidature pressentie n'a demandé à personne de lire un résumé de son programme. La
    // règle vit ici et pas dans la requête du script, sinon le bouton la contournerait.
    dbMock.candidacy.findUnique.mockResolvedValue({ ...CANDIDACY, status: "PRESSENTI" });
    const { generateCandidateSynthesis } = await service();

    const result = await generateCandidateSynthesis("cand-1", { persist: true });

    expect(result).toMatchObject({ ok: false, reason: "non_declaree" });
    expect(callAnthropicMock).not.toHaveBeenCalled();
  });

  it("refuse d'inventer l'extension présidentielle manquante", async () => {
    dbMock.candidacy.findUnique.mockResolvedValue({ ...CANDIDACY, presidentialData: null });
    const { generateCandidateSynthesis } = await service();

    const result = await generateCandidateSynthesis("cand-1", { persist: true });

    expect(result).toMatchObject({ ok: false, reason: "sans_extension" });
    expect(dbMock.candidacyPresidential.update).not.toHaveBeenCalled();
  });

  it("bascule sur Mistral quand Anthropic échoue", async () => {
    // Le repli couvre la panne récurrente du projet : un solde Anthropic à zéro, qui rend un 400.
    callAnthropicMock.mockRejectedValue(new Error("credit balance is too low"));
    callMistralMock.mockResolvedValue({ text: ACCEPTED });
    const { generateCandidateSynthesis } = await service();

    const result = await generateCandidateSynthesis("cand-1", { persist: true });

    expect(result).toMatchObject({ ok: true, provider: "mistral" });
  });

  it("porte les deux erreurs quand les deux fournisseurs tombent", async () => {
    callAnthropicMock.mockRejectedValue(new Error("solde à zéro"));
    callMistralMock.mockRejectedValue(new Error("429"));
    const { generateCandidateSynthesis } = await service();

    const result = await generateCandidateSynthesis("cand-1", { persist: true });

    expect(result).toMatchObject({ ok: false, reason: "generation" });
    // Ne garder que la seconde cacherait pourquoi le premier fournisseur a été sauté.
    expect(result.ok === false && result.message).toContain("solde à zéro");
    expect(result.ok === false && result.message).toContain("429");
    expect(dbMock.candidacyPresidential.update).not.toHaveBeenCalled();
  });

  it("réessaie une fois en nommant la règle enfreinte, puis stocke", async () => {
    callAnthropicMock
      .mockResolvedValueOnce(anthropicText(`Un tiret cadratin — interdit. ${ACCEPTED}`))
      .mockResolvedValueOnce(anthropicText(ACCEPTED));
    const { generateCandidateSynthesis } = await service();

    const result = await generateCandidateSynthesis("cand-1", { persist: true });

    expect(result).toMatchObject({ ok: true });
    expect(callAnthropicMock).toHaveBeenCalledTimes(2);
    const retryPrompt = callAnthropicMock.mock.calls[1]![0][0].content as string;
    expect(retryPrompt).toContain("Ta réponse précédente a été refusée");
  });

  it("ne stocke rien quand le texte est refusé deux fois", async () => {
    callAnthropicMock.mockResolvedValue(anthropicText("Trop court."));
    const { generateCandidateSynthesis } = await service();

    const result = await generateCandidateSynthesis("cand-1", { persist: true });

    expect(result).toMatchObject({ ok: false, reason: "refuse" });
    expect(dbMock.candidacyPresidential.update).not.toHaveBeenCalled();
  });
});
