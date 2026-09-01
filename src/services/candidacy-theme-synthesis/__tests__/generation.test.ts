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
      text: "Les mesures portent sur les maternités et l'accès aux soins de proximité.",
      measureRefs: ["M1", "M2"],
    },
  ],
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
  mocks.callMistral.mockResolvedValue({ model: "mistral-large-2508", text: validOutput });
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

  it("ne sollicite que Mistral et réessaie une seule sortie récupérable", async () => {
    mocks.callMistral
      .mockResolvedValueOnce({ model: "mistral-large-2508", text: "{}" })
      .mockResolvedValueOnce({ model: "mistral-large-2508", text: validOutput });
    const { generateCandidacyThemeSynthesis } = await import("../generation");

    const result = await generateCandidacyThemeSynthesis("cand-1", "SANTE", {
      persist: false,
      actor: { id: "admin", ipAddress: "127.0.0.1", userAgent: "vitest" },
    });

    expect(result).toMatchObject({ ok: true });
    expect(mocks.callMistral).toHaveBeenCalledTimes(2);
    expect(mocks.callMistral.mock.calls[1]![0][0].content).toContain("réponse précédente");
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
