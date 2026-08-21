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
  candidacy: { findUnique: vi.fn() },
  candidacyPresidential: { upsert: vi.fn() },
  programEdition: { findUnique: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
};

vi.mock("@/lib/auth", () => ({ isAuthenticated: () => isAuthenticatedMock() }));
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidatePathMock(path) }));
vi.mock("@/lib/cache", () => ({
  invalidateEntity: (...args: unknown[]) => invalidateEntityMock(...args),
}));
vi.mock("@/lib/presidentielle/candidacy-cache", () => ({
  invalidatePresidentialCandidacyTags: (id: string) => invalidateCandidacyTagsMock(id),
}));
vi.mock("@/lib/db", () => ({ db: dbMock }));

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
  isAuthenticatedMock.mockResolvedValue(true);
  dbMock.candidacy.findUnique.mockResolvedValue(SOURCED_CANDIDACY);
  dbMock.candidacyPresidential.upsert.mockResolvedValue({ id: "pres-1" });
  dbMock.programEdition.findUnique.mockResolvedValue({
    id: "ed-1",
    electionId: "elec-1",
    publicationStatus: "DRAFT",
  });
  dbMock.programEdition.update.mockResolvedValue({ id: "ed-1" });
  dbMock.auditLog.create.mockResolvedValue({ id: "audit-1" });
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
