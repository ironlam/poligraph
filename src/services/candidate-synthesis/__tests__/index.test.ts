import { beforeEach, describe, expect, it, vi } from "vitest";
import { SYNTHESIS_HARD_MAX_WORDS } from "@/lib/presidentielle/candidate-synthesis";

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

const CAREER = Array.from({ length: 40 }, (_, i) => `parcours${i}`).join(" ");
const providerOutput = (refs: string[], career = CAREER) =>
  `<synthese><parcours>${career}.</parcours><programme>${refs
    .map((ref) => `<engagement ref="${ref}" />`)
    .join("")}</programme></synthese>`;
/** Internal provider output and the reader-facing text obtained after evidence screening. */
const ACCEPTED = providerOutput(["M1"]);
const STORED = `${CAREER}.\n\nLes mesures publiées couvrent notamment les thèmes suivants : Santé. Elles sont présentées thème par thème ci-dessous.`;

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
    expect(write.data.synthesis).toBe(STORED);
    expect(write.data.synthesisGeneratedAt).toBeInstanceOf(Date);
    expect(dbMock.auditLog.create).toHaveBeenCalled();
  });

  it("persiste une synthèse valide de 306 mots malgré la cible éditoriale de 200", async () => {
    const career = Array.from({ length: 306 }, (_, index) => `parcours${index}`).join(" ");
    callAnthropicMock.mockResolvedValue(anthropicText(providerOutput(["M1"], career)));
    const { generateCandidateSynthesis } = await service();

    const result = await generateCandidateSynthesis("cand-1", { persist: true });

    expect(result).toMatchObject({ ok: true, persisted: true });
    expect(callAnthropicMock).toHaveBeenCalledTimes(1);
    expect(dbMock.candidacyPresidential.update).toHaveBeenCalledOnce();
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

  // Le cas Arthaud, bout en bout : aucun mandat, aucun vote, cinq mesures. Le service doit demander
  // au modèle la longueur que cette matière porte, et juger sur la même.
  it("annonce au modèle le plancher que la matière porte, et juge sur le même", async () => {
    dbMock.measure.findMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({
        theme: "SANTE",
        publishedRevision: { text: `Rouvrir des maternités de proximité ${i}.` },
      }))
    );
    callAnthropicMock.mockResolvedValue(
      anthropicText(
        providerOutput(["M1"], Array.from({ length: 30 }, (_, i) => `parcours${i}`).join(" "))
      )
    );
    const { generateCandidateSynthesis } = await service();

    const result = await generateCandidateSynthesis("cand-1", { persist: true });

    // Le fournisseur ne rédige plus le paragraphe du programme. Une candidature sans mandat ne
    // doit donc pas recevoir une consigne artificiellement gonflée par ses mesures.
    expect(result).toMatchObject({ ok: true });
    const system = callAnthropicMock.mock.calls[0]![1].system as string;
    expect(system).toContain("Entre 8 et 30 mots dans <parcours>");
    expect(callAnthropicMock).toHaveBeenCalledTimes(1);
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
      .mockResolvedValueOnce(
        anthropicText(
          `<synthese><parcours>Un tiret cadratin — interdit. ${CAREER}.</parcours><programme><engagement ref="M1" /></programme></synthese>`
        )
      )
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

  it("réessaie une prose équilibrée en longueur mais incomplète en thèmes", async () => {
    dbMock.measure.findMany.mockResolvedValue([
      { theme: "SANTE", publishedRevision: { text: "Rouvrir des maternités de proximité." } },
      {
        theme: "TRANSPORTS",
        publishedRevision: { text: "Rétablir des trains de nuit sur six lignes." },
      },
    ]);
    const incomplete = providerOutput(["M1"]);
    const complete = providerOutput(["M1", "M2"]);
    callAnthropicMock
      .mockResolvedValueOnce(anthropicText(incomplete))
      .mockResolvedValueOnce(anthropicText(complete));
    const { generateCandidateSynthesis } = await service();

    const result = await generateCandidateSynthesis("cand-1", { persist: true });

    expect(result).toMatchObject({ ok: true });
    expect(callAnthropicMock).toHaveBeenCalledTimes(2);
    const retryPrompt = callAnthropicMock.mock.calls[1]![0][0].content as string;
    expect(retryPrompt).toContain("aucun engagement vérifiable ne représente le thème Transports");
    expect(dbMock.candidacyPresidential.update).toHaveBeenCalledOnce();
  });

  it("ne persiste pas deux réponses qui dépassent le plafond par thème", async () => {
    dbMock.measure.findMany.mockResolvedValue([
      { theme: "SANTE", publishedRevision: { text: "Rouvrir des maternités de proximité." } },
      { theme: "SANTE", publishedRevision: { text: "Rembourser les soins prescrits." } },
      { theme: "SANTE", publishedRevision: { text: "Créer des centres de santé publics." } },
    ]);
    const concentrated = providerOutput(["M1", "M2", "M3"]);
    callAnthropicMock.mockResolvedValue(anthropicText(concentrated));
    const { generateCandidateSynthesis } = await service();

    const result = await generateCandidateSynthesis("cand-1", { persist: true });

    expect(result).toMatchObject({ ok: false, reason: "refuse" });
    expect(callAnthropicMock).toHaveBeenCalledTimes(2);
    expect(dbMock.candidacyPresidential.update).not.toHaveBeenCalled();
  });

  it("réessaie une action inversée puis persiste uniquement la vue par thème", async () => {
    dbMock.measure.findMany.mockResolvedValue([
      {
        theme: "ECONOMIE_BUDGET",
        publishedRevision: { text: "Augmenter les impôts des entreprises." },
      },
    ]);
    const reversed = `<synthese><parcours>${CAREER}.</parcours><programme><engagement ref="M1">Supprimer les impôts des entreprises.</engagement></programme></synthese>`;
    callAnthropicMock
      .mockResolvedValueOnce(anthropicText(reversed))
      .mockResolvedValueOnce(anthropicText(providerOutput(["M1"])));
    const { generateCandidateSynthesis } = await service();

    const result = await generateCandidateSynthesis("cand-1", { persist: true });

    expect(result).toMatchObject({ ok: true });
    expect(callAnthropicMock).toHaveBeenCalledTimes(2);
    const stored = dbMock.candidacyPresidential.update.mock.calls[0]![0].data.synthesis as string;
    expect(stored).toContain("thèmes suivants : Économie et budget");
    expect(stored).not.toContain("Supprimer");
  });

  it("réessaie puis persiste la phrase canonique d'absence pour une candidature sans mesure", async () => {
    dbMock.measure.findMany.mockResolvedValue([]);
    callAnthropicMock
      .mockResolvedValueOnce(
        anthropicText(
          `<synthese><parcours>${CAREER}.</parcours><programme>Aucune mesure n'est publiée dans le cadre de son programme.</programme></synthese>`
        )
      )
      .mockResolvedValueOnce(
        anthropicText(`<synthese><parcours>${CAREER}.</parcours><programme-vide /></synthese>`)
      );
    const { generateCandidateSynthesis } = await service();

    const result = await generateCandidateSynthesis("cand-1", { persist: true });

    expect(result).toMatchObject({ ok: true, measureCount: 0 });
    expect(callAnthropicMock).toHaveBeenCalledTimes(2);
    const retryPrompt = callAnthropicMock.mock.calls[1]![0][0].content as string;
    expect(retryPrompt).toContain("une candidature sans mesure doit utiliser uniquement");
    expect(dbMock.candidacyPresidential.update.mock.calls[0]![0].data.synthesis).toContain(
      "Aucune mesure n'est publiée dans le cadre de son programme."
    );
  });

  it("réessaie un tribunal généré dans le parcours sans recopier la mesure", async () => {
    dbMock.measure.findMany.mockResolvedValue([
      {
        theme: "SECURITE_JUSTICE",
        publishedRevision: { text: "Créer un tribunal spécialisé." },
      },
    ]);
    const unsafeCareer = `<synthese><parcours>${CAREER}. Il a comparu devant un tribunal.</parcours><programme><engagement ref="M1" /></programme></synthese>`;
    callAnthropicMock
      .mockResolvedValueOnce(anthropicText(unsafeCareer))
      .mockResolvedValueOnce(anthropicText(providerOutput(["M1"])));
    const { generateCandidateSynthesis } = await service();

    const result = await generateCandidateSynthesis("cand-1", { persist: true });

    expect(result).toMatchObject({ ok: true });
    expect(callAnthropicMock).toHaveBeenCalledTimes(2);
    const retryPrompt = callAnthropicMock.mock.calls[1]![0][0].content as string;
    expect(retryPrompt).toContain("mention « tribunal »");
    expect(dbMock.candidacyPresidential.update.mock.calls[0]![0].data.synthesis).not.toContain(
      "Créer un tribunal spécialisé"
    );
  });

  it("réessaie un parcours vide avant de persister", async () => {
    const emptyCareer = `<synthese><parcours></parcours><programme><engagement ref="M1" /></programme></synthese>`;
    callAnthropicMock
      .mockResolvedValueOnce(anthropicText(emptyCareer))
      .mockResolvedValueOnce(anthropicText(providerOutput(["M1"])));
    const { generateCandidateSynthesis } = await service();

    const result = await generateCandidateSynthesis("cand-1", { persist: true });

    expect(result).toMatchObject({ ok: true });
    expect(callAnthropicMock).toHaveBeenCalledTimes(2);
    expect(dbMock.candidacyPresidential.update).toHaveBeenCalledOnce();
  });

  it("ne recopie pas une mesure canonique qui dépasse à elle seule le plafond fixe", async () => {
    const longMeasure = Array.from({ length: 220 }, (_, i) => `source${i}`).join(" ");
    dbMock.measure.findMany.mockResolvedValue([
      { theme: "SANTE", publishedRevision: { text: `${longMeasure}.` } },
    ]);
    callAnthropicMock.mockResolvedValue(anthropicText(providerOutput(["M1"])));
    const { generateCandidateSynthesis } = await service();

    const result = await generateCandidateSynthesis("cand-1", { persist: true });

    expect(result).toMatchObject({ ok: true });
    expect(callAnthropicMock).toHaveBeenCalledTimes(1);
    expect(dbMock.candidacyPresidential.update.mock.calls[0]![0].data.synthesis).not.toContain(
      "source219"
    );
  });

  it("ignore la longueur d'une seconde formulation qui n'est pas rendue", async () => {
    const longOptional = Array.from(
      { length: SYNTHESIS_HARD_MAX_WORDS + 20 },
      (_, i) => `option${i}`
    ).join(" ");
    dbMock.measure.findMany.mockResolvedValue([
      { theme: "SANTE", publishedRevision: { text: "Rouvrir des maternités de proximité." } },
      { theme: "SANTE", publishedRevision: { text: `${longOptional}.` } },
    ]);
    callAnthropicMock.mockResolvedValue(anthropicText(providerOutput(["M2", "M1"])));
    const { generateCandidateSynthesis } = await service();

    const result = await generateCandidateSynthesis("cand-1", { persist: true });

    expect(result).toMatchObject({ ok: true });
    expect(callAnthropicMock).toHaveBeenCalledTimes(1);
    expect(dbMock.candidacyPresidential.update).toHaveBeenCalledOnce();
  });
});
