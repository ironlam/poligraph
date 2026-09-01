import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findCandidacy: vi.fn(),
  findMeasures: vi.fn(),
  upsertSynthesis: vi.fn(),
  createAudit: vi.fn(),
  callMistral: vi.fn(),
  lockCandidacy: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    candidacy: { findUnique: mocks.findCandidacy },
    measure: { findMany: mocks.findMeasures },
    candidacyThemeSynthesis: { upsert: mocks.upsertSynthesis },
    auditLog: { create: mocks.createAudit },
    $transaction: (callback: (tx: unknown) => unknown) =>
      callback({
        candidacy: { findUnique: mocks.findCandidacy },
        measure: { findMany: mocks.findMeasures },
        candidacyThemeSynthesis: { upsert: mocks.upsertSynthesis },
        auditLog: { create: mocks.createAudit },
      }),
  },
}));
vi.mock("@/lib/api/mistral", () => ({
  callMistral: mocks.callMistral,
  extractMistralText: (response: { text: string }) => response.text,
  parseMistralJSON: (text: string) => JSON.parse(text),
}));
vi.mock("@/lib/measures/lock", () => ({
  lockMeasureCandidacy: mocks.lockCandidacy,
}));

const validOutput = JSON.stringify({
  theme: "SANTE",
  claims: [
    {
      text: "Les mesures prévoient de rouvrir des maternités et de développer les soins de proximité. Elles mentionnent les maternités, les soins et leur proximité.",
      measureRefs: ["M1", "M2"],
    },
  ],
});
const validVerification = JSON.stringify({
  claims: [{ index: 0, supported: true, reason: "Les deux mesures citées l'étayent." }],
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findCandidacy.mockResolvedValue({
    id: "cand-1",
    candidateName: "Camille Démonstration",
    electionId: "election-1",
    status: "DECLARE",
    presidentialData: { id: "pres-1" },
  });
  mocks.findMeasures.mockResolvedValue([
    {
      id: "measure-1",
      publishedRevisionId: "revision-1",
      publishedRevision: { text: "Rouvrir des maternités.", details: null },
    },
    {
      id: "measure-2",
      publishedRevisionId: "revision-2",
      publishedRevision: { text: "Développer les soins de proximité.", details: null },
    },
  ]);
  mocks.callMistral.mockImplementation(async (messages: Array<{ content: string }>) => ({
    model: "mistral-large-2508",
    text: messages[0]?.content.includes("<affirmations>") ? validVerification : validOutput,
  }));
  mocks.upsertSynthesis.mockResolvedValue({ id: "synthesis-1" });
  mocks.createAudit.mockResolvedValue({ id: "audit-1" });
});

describe("generateCandidacyThemeSynthesis", () => {
  it("prévisualise sans aucune écriture", async () => {
    const { generateCandidacyThemeSynthesis } = await import("../generation");

    const result = await generateCandidacyThemeSynthesis("cand-1", "SANTE", {
      persist: false,
      actor: { id: "admin", ipAddress: "127.0.0.1", userAgent: "vitest" },
    });

    expect(result).toMatchObject({ ok: true, persisted: false, measureCount: 2 });
    expect(mocks.upsertSynthesis).not.toHaveBeenCalled();
    expect(mocks.createAudit).not.toHaveBeenCalled();
  });

  it("enregistre seulement un brouillon à relire avec son empreinte et ses preuves", async () => {
    const { generateCandidacyThemeSynthesis } = await import("../generation");

    const result = await generateCandidacyThemeSynthesis("cand-1", "SANTE", {
      persist: true,
      actor: { id: "admin", ipAddress: "127.0.0.1", userAgent: "vitest" },
    });

    expect(result).toMatchObject({ ok: true, persisted: true, model: "mistral-large-2508" });
    expect(mocks.upsertSynthesis).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          candidacyPresidentialId_theme: {
            candidacyPresidentialId: "pres-1",
            theme: "SANTE",
          },
        },
        create: expect.objectContaining({
          status: "PENDING_REVIEW",
          evidence: expect.objectContaining({ claims: expect.any(Array) }),
          corpusFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
        update: expect.objectContaining({
          status: "PENDING_REVIEW",
          validatedAt: null,
          publishedAt: null,
        }),
      })
    );
    expect(mocks.createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "GENERATE_THEME_SYNTHESIS",
          entityType: "CandidacyThemeSynthesis",
        }),
      })
    );
    expect(mocks.lockCandidacy).toHaveBeenCalledWith(expect.anything(), "cand-1");
  });

  it("refuse d'enregistrer une synthèse si le corpus change pendant l'appel Mistral", async () => {
    mocks.findMeasures
      .mockResolvedValueOnce([
        {
          id: "measure-1",
          publishedRevisionId: "revision-1",
          publishedRevision: { text: "Rouvrir des maternités.", details: null },
        },
        {
          id: "measure-2",
          publishedRevisionId: "revision-2",
          publishedRevision: { text: "Développer les soins de proximité.", details: null },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "measure-1",
          publishedRevisionId: "revision-3",
          publishedRevision: { text: "Rouvrir des maternités de proximité.", details: null },
        },
      ]);
    const { generateCandidacyThemeSynthesis } = await import("../generation");

    const result = await generateCandidacyThemeSynthesis("cand-1", "SANTE", {
      persist: true,
      actor: { id: "admin", ipAddress: "127.0.0.1", userAgent: "vitest" },
    });

    expect(result).toMatchObject({ ok: false, reason: "corpus_modifie" });
    expect(mocks.lockCandidacy).toHaveBeenCalledWith(expect.anything(), "cand-1");
    expect(mocks.upsertSynthesis).not.toHaveBeenCalled();
    expect(mocks.createAudit).not.toHaveBeenCalled();
  });

  it("ne sollicite que Mistral et réessaie une seule sortie récupérable", async () => {
    mocks.callMistral
      .mockResolvedValueOnce({ model: "mistral-large-2508", text: "{}" })
      .mockResolvedValueOnce({ model: "mistral-large-2508", text: validOutput })
      .mockResolvedValueOnce({ model: "mistral-large-2508", text: validVerification });
    const { generateCandidacyThemeSynthesis } = await import("../generation");

    const result = await generateCandidacyThemeSynthesis("cand-1", "SANTE", {
      persist: false,
      actor: { id: "admin", ipAddress: "127.0.0.1", userAgent: "vitest" },
    });

    expect(result).toMatchObject({ ok: true });
    expect(mocks.callMistral).toHaveBeenCalledTimes(3);
    expect(mocks.callMistral.mock.calls[1]![0][0].content).toContain("réponse précédente");
  });

  it("régénère une sortie que le second passage Mistral juge non étayée", async () => {
    mocks.callMistral
      .mockResolvedValueOnce({ model: "mistral-large-2508", text: validOutput })
      .mockResolvedValueOnce({
        model: "mistral-large-2508",
        text: JSON.stringify({
          claims: [{ index: 0, supported: false, reason: "Un effet est ajouté." }],
        }),
      })
      .mockResolvedValueOnce({ model: "mistral-large-2508", text: validOutput })
      .mockResolvedValueOnce({ model: "mistral-large-2508", text: validVerification });
    const { generateCandidacyThemeSynthesis } = await import("../generation");

    const result = await generateCandidacyThemeSynthesis("cand-1", "SANTE", {
      persist: false,
      actor: { id: "admin", ipAddress: "127.0.0.1", userAgent: "vitest" },
    });

    expect(result).toMatchObject({ ok: true });
    expect(mocks.callMistral).toHaveBeenCalledTimes(4);
    expect(mocks.callMistral.mock.calls[2]![0][0].content).toContain("effet est ajouté");
  });

  it("accepte le corpus public d'une candidature retirée", async () => {
    mocks.findCandidacy.mockResolvedValue({
      id: "cand-1",
      candidateName: "Camille Démonstration",
      electionId: "election-1",
      status: "RETIRE",
      presidentialData: { id: "pres-1" },
    });
    const { generateCandidacyThemeSynthesis } = await import("../generation");

    const result = await generateCandidacyThemeSynthesis("cand-1", "SANTE", {
      persist: false,
      actor: { id: "admin", ipAddress: "127.0.0.1", userAgent: "vitest" },
    });

    expect(result).toMatchObject({ ok: true });
  });

  it("refuse un thème sans mesure publiée sans appeler le fournisseur", async () => {
    mocks.findMeasures.mockResolvedValue([]);
    const { generateCandidacyThemeSynthesis } = await import("../generation");

    const result = await generateCandidacyThemeSynthesis("cand-1", "SANTE", {
      persist: true,
      actor: { id: "admin", ipAddress: "127.0.0.1", userAgent: "vitest" },
    });

    expect(result).toMatchObject({ ok: false, reason: "theme_non_couvert" });
    expect(mocks.callMistral).not.toHaveBeenCalled();
    expect(mocks.upsertSynthesis).not.toHaveBeenCalled();
  });
});
