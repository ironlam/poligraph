import { beforeEach, describe, expect, it, vi } from "vitest";

const upsertSearchDocumentMock = vi.fn(async (_tx: unknown, _input: unknown) => undefined);
const deleteSearchDocumentMock = vi.fn(
  async (_tx: unknown, _entityType: unknown, _entityId: unknown) => undefined
);
const syncMeasureSearchDocumentsMock = vi.fn(
  async (_tx: unknown, _entityIds: unknown) => undefined
);

vi.mock("@/lib/search/documents", () => ({
  upsertSearchDocument: (tx: unknown, input: unknown) => upsertSearchDocumentMock(tx, input),
  deleteSearchDocument: (tx: unknown, entityType: unknown, entityId: unknown) =>
    deleteSearchDocumentMock(tx, entityType, entityId),
}));
vi.mock("@/lib/measures/search-sync", () => ({
  syncSearchDocuments: (tx: unknown, entityIds: unknown) =>
    syncMeasureSearchDocumentsMock(tx, entityIds),
}));

const now = new Date("2026-08-27T12:00:00Z");
const candidate = {
  id: "cand-1",
  electionId: "election-1",
  candidateName: "Alice Martin",
  status: "DECLARE" as const,
  sourceUrl: "https://example.org/annonce",
  sourceLabel: "Annonce publique",
  updatedAt: now,
  election: { slug: "presidentielle-test" },
  presidentialData: { updatedAt: now },
  politician: {
    slug: "alice-martin",
    fullName: "Alice Martin",
    publicationStatus: "PUBLISHED" as const,
    updatedAt: now,
  },
  party: { name: "Parti test", shortName: "PT", updatedAt: now },
};

function transaction(publicCandidate: boolean) {
  return {
    candidacy: {
      findUnique: vi.fn(async () => candidate),
      findFirst: vi.fn(async () => (publicCandidate ? { id: candidate.id } : null)),
      findMany: vi.fn(async () => [] as Array<{ id: string; electionId: string }>),
    },
    measure: { findMany: vi.fn(async () => [{ id: "measure-1" }, { id: "measure-2" }]) },
  };
}

describe("synchronisation recherche des candidatures présidentielles", () => {
  beforeEach(() => vi.clearAllMocks());

  it("écrit le scope, les libellés centraux et l'URL canonique réelle", async () => {
    const { syncCandidacySearchDocument } = await import("../search-sync");
    const tx = transaction(true);

    await syncCandidacySearchDocument(tx as never, candidate.id);

    expect(upsertSearchDocumentMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        entityType: "CANDIDACY",
        entityId: "cand-1",
        electionId: "election-1",
        title: "Alice Martin",
        body: "Alice Martin PT Candidature annoncée",
        url: "/elections/presidentielle-test/candidats/alice-martin",
        visibility: "PUBLIC",
        sourceRevisionId: null,
      })
    );
  });

  it("échoue fermé quand l'autorité du hub n'est plus satisfaite", async () => {
    const { syncCandidacySearchDocument } = await import("../search-sync");
    const tx = transaction(false);

    await syncCandidacySearchDocument(tx as never, candidate.id);

    expect(upsertSearchDocumentMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ visibility: "ADMIN_ONLY" })
    );
  });

  it("réévalue toutes les mesures dont la visibilité dépend de la fiche", async () => {
    const { syncPresidentialSearchDocumentsForCandidacy } = await import("../search-sync");
    const tx = transaction(true);

    await syncPresidentialSearchDocumentsForCandidacy(tx as never, candidate.id);

    expect(syncMeasureSearchDocumentsMock).toHaveBeenCalledWith(tx, ["measure-1", "measure-2"]);
  });

  it("réindexe les candidatures présidentielles après le renommage d'un parti", async () => {
    const { syncCandidacySearchDocumentsForParty } = await import("../search-sync");
    const tx = transaction(true);
    tx.candidacy.findMany = vi.fn(async () => [
      { id: "cand-1", electionId: "election-1" },
      { id: "cand-2", electionId: "election-1" },
      { id: "cand-3", electionId: "election-2" },
    ]) as never;

    const electionIds = await syncCandidacySearchDocumentsForParty(tx as never, "party-1");

    expect(tx.candidacy.findMany).toHaveBeenCalledWith({
      where: { partyId: "party-1", election: { type: "PRESIDENTIELLE" } },
      select: { id: true, electionId: true },
      orderBy: { id: "asc" },
    });
    expect(upsertSearchDocumentMock).toHaveBeenCalledTimes(3);
    expect(syncMeasureSearchDocumentsMock).toHaveBeenCalledTimes(3);
    expect(electionIds).toEqual(["election-1", "election-2"]);
  });
});
