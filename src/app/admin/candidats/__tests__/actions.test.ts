import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The two publication switches of a presidential candidacy.
 *
 * A server action is a network endpoint: the page guard does not protect it, so each test starts
 * by checking that an unauthenticated call writes NOTHING. Asserting only that it throws would not
 * be enough, since a throw after the write would look identical.
 */

const isAuthenticatedMock = vi.fn<() => Promise<boolean>>();
const revalidatePathMock = vi.fn();
const invalidateEntityMock = vi.fn();
const invalidateCandidacyTagsMock = vi.fn();

const dbMock = {
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
  candidacy: { findUnique: vi.fn(), update: vi.fn() },
  candidacyPresidential: { upsert: vi.fn(), updateMany: vi.fn() },
  programEdition: { findUnique: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
};

vi.mock("@/lib/auth", () => ({ isAuthenticated: () => isAuthenticatedMock() }));
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidatePathMock(path) }));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      "x-forwarded-for": "203.0.113.10, 10.0.0.1",
      "user-agent": "Poligraph test",
    }),
}));
vi.mock("@/lib/cache", () => ({
  invalidateEntity: (...args: unknown[]) => invalidateEntityMock(...args),
}));
vi.mock("@/lib/presidentielle/candidacy-cache", () => ({
  invalidatePresidentialCandidacyTags: (id: string) => invalidateCandidacyTagsMock(id),
}));
vi.mock("@/lib/presidentielle/search-sync", () => ({
  syncPresidentialSearchDocumentsForCandidacy: vi.fn(async () => undefined),
}));
vi.mock("@/lib/db", () => ({ db: dbMock }));

const generateSynthesisMock = vi.fn<(id: string, options: unknown) => Promise<unknown>>();
vi.mock("@/services/candidate-synthesis", () => ({
  generateCandidateSynthesis: (id: string, options: unknown) => generateSynthesisMock(id, options),
}));

const SOURCED_CANDIDACY = {
  id: "cand-1",
  electionId: "elec-1",
  status: "DECLARE",
  sourceUrl: "https://example.org/annonce",
  sourceLabel: "Annonce de candidature",
  presidentialData: { id: "pres-1", publicationStatus: "DRAFT" },
};

async function actions() {
  return import("../actions");
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.$transaction.mockImplementation(async (callback) => callback(dbMock));
  dbMock.$queryRaw.mockResolvedValue([{ id: "cand-1" }]);
  isAuthenticatedMock.mockResolvedValue(true);
  dbMock.candidacy.findUnique.mockResolvedValue(SOURCED_CANDIDACY);
  dbMock.candidacyPresidential.upsert.mockResolvedValue({ id: "pres-1" });
  dbMock.candidacyPresidential.updateMany.mockResolvedValue({ count: 1 });
  dbMock.candidacy.update.mockResolvedValue({ id: "cand-1" });
  dbMock.programEdition.findUnique.mockResolvedValue({
    id: "ed-1",
    electionId: "elec-1",
    publicationStatus: "DRAFT",
  });
  dbMock.programEdition.update.mockResolvedValue({ id: "ed-1" });
  dbMock.auditLog.create.mockResolvedValue({ id: "audit-1" });
  generateSynthesisMock.mockResolvedValue({
    ok: true,
    text: "Une synthèse.",
    provider: "mistral-large-latest",
    measureCount: 5,
    mandateCount: 0,
    persisted: false,
  });
});

describe("actions de publication des candidatures", () => {
  it("n'écrit rien sans session", async () => {
    isAuthenticatedMock.mockResolvedValue(false);
    const a = await actions();

    await expect(
      a.setCandidacyPublicationAction({ candidacyId: "cand-1", status: "PUBLISHED" })
    ).rejects.toThrow("Non autorisé");
    await expect(
      a.setProgramEditionPublicationAction({ programEditionId: "ed-1", status: "PUBLISHED" })
    ).rejects.toThrow("Non autorisé");

    expect(dbMock.candidacyPresidential.upsert).not.toHaveBeenCalled();
    expect(dbMock.programEdition.update).not.toHaveBeenCalled();
    expect(dbMock.auditLog.create).not.toHaveBeenCalled();
  });

  it("publie l'extension et invalide le tag que les surfaces du hub lisent", async () => {
    const a = await actions();

    const result = await a.setCandidacyPublicationAction({
      candidacyId: "cand-1",
      status: "PUBLISHED",
    });

    expect(result).toEqual({ ok: true });
    expect(dbMock.$queryRaw).toHaveBeenCalledOnce();
    expect(dbMock.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      dbMock.candidacy.findUnique.mock.invocationCallOrder[0]!
    );
    expect(dbMock.candidacyPresidential.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { candidacyId: "cand-1" },
        create: { candidacyId: "cand-1", publicationStatus: "PUBLISHED" },
        update: { publicationStatus: "PUBLISHED" },
      })
    );
    expect(invalidateCandidacyTagsMock).toHaveBeenCalledWith("elec-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/candidats");
  });

  it("crée l'extension absente au lieu d'échouer", async () => {
    dbMock.candidacy.findUnique.mockResolvedValue({ ...SOURCED_CANDIDACY, presidentialData: null });
    dbMock.candidacyPresidential.upsert.mockResolvedValue({ id: "pres-nouveau" });
    const a = await actions();

    const result = await a.setCandidacyPublicationAction({
      candidacyId: "cand-1",
      status: "PUBLISHED",
    });

    expect(result).toEqual({ ok: true });
    expect(dbMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CREATE", entityType: "CandidacyPresidential" }),
      })
    );
  });

  it("refuse de publier une candidature non sourcée", async () => {
    // La fiche publique écarte une candidature sans statut ni source : publier l'extension
    // ouvrirait le hub sur un candidat dont la fiche redirige.
    dbMock.candidacy.findUnique.mockResolvedValue({
      ...SOURCED_CANDIDACY,
      sourceUrl: null,
      sourceLabel: null,
    });
    const a = await actions();

    const result = await a.setCandidacyPublicationAction({
      candidacyId: "cand-1",
      status: "PUBLISHED",
    });

    expect(result.ok).toBe(false);
    expect(dbMock.candidacyPresidential.upsert).not.toHaveBeenCalled();
  });

  it("dépublie une candidature non sourcée sans la bloquer", async () => {
    // La garde protège la mise en ligne, pas le retrait : refuser le retour au brouillon
    // enfermerait une candidature publiée dont la source a été effacée.
    dbMock.candidacy.findUnique.mockResolvedValue({
      ...SOURCED_CANDIDACY,
      sourceUrl: null,
      sourceLabel: null,
      presidentialData: { id: "pres-1", publicationStatus: "PUBLISHED" },
    });
    const a = await actions();

    const result = await a.setCandidacyPublicationAction({
      candidacyId: "cand-1",
      status: "DRAFT",
    });

    expect(result).toEqual({ ok: true });
    expect(dbMock.candidacyPresidential.upsert).toHaveBeenCalled();
  });

  it("signale une candidature introuvable sans rien écrire", async () => {
    dbMock.candidacy.findUnique.mockResolvedValue(null);
    const a = await actions();

    const result = await a.setCandidacyPublicationAction({
      candidacyId: "inconnue",
      status: "PUBLISHED",
    });

    expect(result).toEqual({ ok: false, message: "Candidature introuvable." });
    expect(dbMock.candidacyPresidential.upsert).not.toHaveBeenCalled();
  });

  it("publie une édition de programme et trace le statut précédent", async () => {
    const a = await actions();

    const result = await a.setProgramEditionPublicationAction({
      programEditionId: "ed-1",
      status: "PUBLISHED",
    });

    expect(result).toEqual({ ok: true });
    expect(dbMock.programEdition.update).toHaveBeenCalledWith({
      where: { id: "ed-1" },
      data: { publicationStatus: "PUBLISHED" },
    });
    expect(dbMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: "ProgramEdition",
          changes: { publicationStatus: "PUBLISHED", previousPublicationStatus: "DRAFT" },
        }),
      })
    );
    expect(invalidateCandidacyTagsMock).toHaveBeenCalledWith("elec-1");
  });

  it("rejette un statut de publication inconnu", async () => {
    const a = await actions();

    const result = await a.setProgramEditionPublicationAction({
      programEditionId: "ed-1",
      // @ts-expect-error une action serveur reçoit ce que le réseau lui envoie
      status: "EN_LIGNE",
    });

    expect(result).toEqual({ ok: false, message: "Requête invalide." });
    expect(dbMock.programEdition.update).not.toHaveBeenCalled();
  });
});

describe("statut politique d'une candidature", () => {
  it("efface la synthèse en quittant le statut déclaré", async () => {
    dbMock.candidacy.findUnique.mockResolvedValue({
      ...SOURCED_CANDIDACY,
      presidentialData: { ...SOURCED_CANDIDACY.presidentialData, synthesis: "Synthèse existante" },
    });
    const a = await actions();

    expect(
      await a.setCandidacyStatusAction({
        candidacyId: "cand-1",
        status: "PRESSENTI",
        sourceUrl: "https://example.org/nouveau-statut",
        sourceLabel: "Annonce officielle",
      })
    ).toEqual({ ok: true });
    expect(dbMock.candidacyPresidential.updateMany).toHaveBeenCalledWith({
      where: { candidacyId: "cand-1" },
      data: { synthesis: null, synthesisGeneratedAt: null },
    });
    expect(dbMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          changes: expect.objectContaining({ synthesisCleared: true }),
        }),
      })
    );
  });

  it.each([
    "not a url",
    "mailto:redaction@example.org",
    "ftp://example.org/source",
    "data:text/plain,test",
  ])("refuse une source non HTTP(S): %s", async (sourceUrl) => {
    const a = await actions();

    expect(
      await a.setCandidacyStatusAction({
        candidacyId: "cand-1",
        status: "DECLARE",
        sourceUrl,
        sourceLabel: "Déclaration officielle",
      })
    ).toEqual({ ok: false, message: "Requête invalide." });
    expect(dbMock.$transaction).not.toHaveBeenCalled();
  });

  it("met à jour le statut sourcé et écrit l'audit", async () => {
    dbMock.candidacy.findUnique.mockResolvedValue({ ...SOURCED_CANDIDACY, status: "PRESSENTI" });
    const a = await actions();

    expect(
      await a.setCandidacyStatusAction({
        candidacyId: "cand-1",
        status: "DECLARE",
        sourceUrl: "https://example.org/declaration",
        sourceLabel: "Déclaration officielle",
      })
    ).toEqual({ ok: true });
    expect(dbMock.candidacy.update).toHaveBeenCalledWith({
      where: { id: "cand-1" },
      data: {
        status: "DECLARE",
        sourceUrl: "https://example.org/declaration",
        sourceLabel: "Déclaration officielle",
      },
    });
    expect(dbMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: "Candidacy",
          entityId: "cand-1",
          changes: expect.objectContaining({
            status: "DECLARE",
            sourceUrl: "https://example.org/declaration",
            sourceLabel: "Déclaration officielle",
            previousStatus: "PRESSENTI",
          }),
          ipAddress: "203.0.113.10",
          userAgent: "Poligraph test",
        }),
      })
    );
  });
});

/**
 * Same doctrine as the two switches above: the action is a network endpoint, so an unauthenticated
 * call must reach neither the provider nor the database.
 */
describe("génération d'une proposition de synthèse", () => {
  it("n'appelle pas le générateur sans session", async () => {
    isAuthenticatedMock.mockResolvedValue(false);
    const { regenerateCandidateSynthesisAction } = await actions();

    await expect(regenerateCandidateSynthesisAction({ candidacyId: "cand-1" })).rejects.toThrow();
    expect(generateSynthesisMock).not.toHaveBeenCalled();
  });

  it("renvoie une proposition sans écrire ni purger les surfaces publiques", async () => {
    const { regenerateCandidateSynthesisAction } = await actions();

    const result = await regenerateCandidateSynthesisAction({ candidacyId: "cand-1" });

    expect(result).toEqual({ ok: true, text: "Une synthèse." });
    expect(generateSynthesisMock).toHaveBeenCalledWith("cand-1", {
      persist: false,
      returnRejectedProposal: true,
    });
    expect(invalidateCandidacyTagsMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("transmet à l'éditeur l'avertissement du contrôle automatique", async () => {
    generateSynthesisMock.mockResolvedValue({
      ok: true,
      text: "Une proposition à corriger.",
      provider: "mistral-large-latest",
      measureCount: 5,
      mandateCount: 0,
      persisted: false,
      reviewWarning: "Cette proposition n'a pas passé le contrôle automatique.",
    });
    const { regenerateCandidateSynthesisAction } = await actions();

    const result = await regenerateCandidateSynthesisAction({ candidacyId: "cand-1" });

    expect(result).toEqual({
      ok: true,
      text: "Une proposition à corriger.",
      reviewWarning: "Cette proposition n'a pas passé le contrôle automatique.",
    });
  });

  it("rend le refus du service au lieu de le traduire en échec générique", async () => {
    generateSynthesisMock.mockResolvedValue({
      ok: false,
      reason: "non_declaree",
      message: "Seule une candidature déclarée porte une synthèse.",
    });
    const { regenerateCandidateSynthesisAction } = await actions();

    const result = await regenerateCandidateSynthesisAction({ candidacyId: "cand-1" });

    expect(result).toEqual({
      ok: false,
      message: "Seule une candidature déclarée porte une synthèse.",
    });
    // Rien n'a changé : purger ferait recalculer les surfaces pour rien.
    expect(invalidateCandidacyTagsMock).not.toHaveBeenCalled();
  });

  it("refuse une candidature introuvable sans appeler le générateur", async () => {
    dbMock.candidacy.findUnique.mockResolvedValue(null);
    const { regenerateCandidateSynthesisAction } = await actions();

    const result = await regenerateCandidateSynthesisAction({ candidacyId: "cand-1" });

    expect(result).toEqual({ ok: false, message: "Candidature introuvable." });
    expect(generateSynthesisMock).not.toHaveBeenCalled();
  });

  it("rejette une entrée qui ne porte pas d'identifiant", async () => {
    const { regenerateCandidateSynthesisAction } = await actions();

    const result = await regenerateCandidateSynthesisAction({ candidacyId: "" });

    expect(result).toEqual({ ok: false, message: "Requête invalide." });
    expect(generateSynthesisMock).not.toHaveBeenCalled();
  });
});
