import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  syncMeasureSearchDocument: vi.fn(async () => undefined),
  syncCandidacySearchDocument: vi.fn(async () => undefined),
  syncAllCandidacySearchDocuments: vi.fn(async () => undefined),
  invalidateMeasureTags: vi.fn(),
}));

const tx = {
  measure: {
    findUniqueOrThrow: vi.fn(async () => ({
      electionId: "election-1",
      candidacyId: "candidacy-1",
      publishedRevisionId: null,
      latestRevisionId: "revision-1",
      updatedAt: new Date("2026-08-29T12:00:00Z"),
    })),
    update: vi.fn(async () => undefined),
  },
  candidacy: {
    findFirst: vi.fn(async () => null as { id: string } | null),
  },
  measureRevision: {
    findUnique: vi.fn(async () => ({
      measureId: "measure-1",
      text: "Une mesure relue et sourcée.",
      reviewedAt: new Date("2026-08-29T12:00:00Z"),
      discardedAt: null,
      supersededAt: null,
      evidenceSnapshot: null,
      reviewReadiness: null,
      _count: { sources: 1 },
    })),
    update: vi.fn(async () => undefined),
  },
  auditLog: { create: vi.fn(async () => undefined) },
};

vi.mock("@/lib/db", () => ({
  db: { $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) },
}));
vi.mock("../lock", () => ({
  lockMeasure: vi.fn(async () => undefined),
  lockMeasureCandidacy: vi.fn(async () => undefined),
}));
vi.mock("../cache", () => ({ invalidateMeasureTags: mocks.invalidateMeasureTags }));
vi.mock("../search-sync", () => ({
  syncSearchDocument: mocks.syncMeasureSearchDocument,
}));
vi.mock("@/lib/presidentielle/search-sync", () => ({
  syncCandidacySearchDocument: mocks.syncCandidacySearchDocument,
  syncPresidentialSearchDocumentsForCandidacy: mocks.syncAllCandidacySearchDocuments,
}));

describe("périmètre de recherche lors d'une publication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.candidacy.findFirst.mockReset();
    tx.candidacy.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "candidacy-1" });
  });

  it("n'indexe que la candidature et la mesure qui ouvre la fiche", async () => {
    const { publishMeasureRevision } = await import("../transitions");

    await publishMeasureRevision({ measureId: "measure-1", revisionId: "revision-1" });

    expect(mocks.syncCandidacySearchDocument).toHaveBeenCalledWith(tx, "candidacy-1");
    expect(mocks.syncMeasureSearchDocument).toHaveBeenCalledWith(tx, "measure-1");
    expect(mocks.syncAllCandidacySearchDocuments).not.toHaveBeenCalled();
  });
});
