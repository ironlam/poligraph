import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  factCheckFindUnique: vi.fn(),
  factCheckFindFirst: vi.fn(),
  factCheckCreate: vi.fn(),
  factCheckUpsert: vi.fn(),
  mentionFindMany: vi.fn(),
  mentionFindUnique: vi.fn(),
  mentionCreate: vi.fn(),
  mentionUpdate: vi.fn(),
  mentionDeleteMany: vi.fn(),
  auditLogFindMany: vi.fn(),
  searchClaims: vi.fn(),
  requestProfileRefresh: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    factCheck: {
      findUnique: h.factCheckFindUnique,
      findFirst: h.factCheckFindFirst,
      create: h.factCheckCreate,
      upsert: h.factCheckUpsert,
    },
    factCheckMention: {
      findMany: h.mentionFindMany,
      findUnique: h.mentionFindUnique,
      create: h.mentionCreate,
      update: h.mentionUpdate,
      deleteMany: h.mentionDeleteMany,
    },
    auditLog: { findMany: h.auditLogFindMany },
  },
}));
vi.mock("@/lib/api", () => ({
  searchClaims: h.searchClaims,
  mapTextualRating: () => "FALSE",
  fetchPageTitle: vi.fn(),
}));
vi.mock("@/lib/name-matching", () => ({
  normalizeText: (s: string) => s.toLowerCase(),
  buildPoliticianIndex: async () => [
    {
      id: "p1",
      fullName: "Camille Exemple",
      normalizedFullName: "camille exemple",
      normalizedLastName: "exemple",
    },
  ],
  findMentions: () => [],
}));
vi.mock("@/lib/identity/mention-blocklist", () => ({
  loadMentionBlocklist: async () => ({ isBlocked: () => false }),
}));
vi.mock("@/lib/sync", () => ({ syncMetadata: { get: vi.fn(), set: vi.fn() } }));
vi.mock("@/lib/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/utils")>()),
  sleep: async () => {},
}));
vi.mock("@/lib/politicians/profile-snapshot/request", () => ({
  requestProfileRefresh: h.requestProfileRefresh,
}));

import { syncFactchecks } from "../factchecks";

const claim = {
  text: "Une affirmation fictive",
  claimant: null,
  claimDate: null,
  claimReview: [
    {
      url: "https://example.org/verif-fictive",
      title: "Vérification fictive",
      publisher: { name: "AFP Factuel" },
      textualRating: "Faux",
      reviewDate: "2026-01-01",
      languageCode: "fr",
    },
  ],
};

describe("syncFactchecks et les fiches précalculées", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.searchClaims.mockResolvedValue([claim]);
    h.factCheckFindUnique.mockResolvedValue(null);
    h.factCheckFindFirst.mockResolvedValue(null);
    h.factCheckCreate.mockResolvedValue({ id: "f-nouveau" });
    h.factCheckUpsert.mockResolvedValue({ id: "f-reecrit" });
    h.mentionFindMany.mockResolvedValue([]);
    h.mentionFindUnique.mockResolvedValue(null);
    h.auditLogFindMany.mockResolvedValue([]);
    h.requestProfileRefresh.mockResolvedValue({ sent: 1, mode: "targeted" });
  });

  it("demande une fois le recalcul des fiches mentionnées par les fact-checks créés", async () => {
    await syncFactchecks({ politician: "exemple" });

    expect(h.requestProfileRefresh).toHaveBeenCalledTimes(1);
    expect(h.requestProfileRefresh).toHaveBeenCalledWith(
      { factCheckIds: ["f-nouveau"] },
      "sync:factchecks"
    );
    expect(h.requestProfileRefresh.mock.invocationCallOrder[0]).toBeGreaterThan(
      h.factCheckCreate.mock.invocationCallOrder[0]!
    );
  });

  it("demande le recalcul quand une mention s'ajoute à un fact-check existant", async () => {
    h.factCheckFindFirst.mockResolvedValue({ id: "f-existant" });

    await syncFactchecks({ politician: "exemple" });

    expect(h.mentionCreate).toHaveBeenCalledTimes(1);
    expect(h.requestProfileRefresh).toHaveBeenCalledWith(
      { factCheckIds: ["f-existant"] },
      "sync:factchecks"
    );
  });

  it("ne demande rien quand le run n'écrit aucun fact-check", async () => {
    h.factCheckFindUnique.mockResolvedValue({ id: "f-deja-connu" });

    await syncFactchecks({ politician: "exemple" });

    expect(h.factCheckCreate).not.toHaveBeenCalled();
    expect(h.requestProfileRefresh).not.toHaveBeenCalled();
  });

  it("ne demande rien quand la mention existe déjà", async () => {
    h.factCheckFindFirst.mockResolvedValue({ id: "f-existant" });
    h.mentionFindUnique.mockResolvedValue({ factCheckId: "f-existant" });

    await syncFactchecks({ politician: "exemple" });

    expect(h.requestProfileRefresh).not.toHaveBeenCalled();
  });

  it("avec --force, demande aussi le recalcul des politiciens retirés des mentions", async () => {
    // The stored fact-check mentions p-retire; this run only matches the target, p1.
    h.mentionFindMany.mockResolvedValue([
      { id: "m-retire", politicianId: "p-retire", isClaimant: false },
    ]);

    await syncFactchecks({ politician: "exemple", force: true });

    expect(h.mentionFindMany).toHaveBeenCalledWith({
      where: { factCheck: { sourceUrl: "https://example.org/verif-fictive" } },
      select: { id: true, politicianId: true, isClaimant: true },
    });
    // Read before the upsert.
    expect(h.mentionFindMany.mock.invocationCallOrder[0]).toBeLessThan(
      h.factCheckUpsert.mock.invocationCallOrder[0]!
    );
    expect(h.requestProfileRefresh).toHaveBeenCalledExactlyOnceWith(
      { factCheckIds: ["f-reecrit"], politicianIds: ["p-retire"] },
      "sync:factchecks"
    );
  });

  it("avec --force, conserve une mention corrigée dans l'admin que le run ne retrouve pas", async () => {
    h.mentionFindMany.mockResolvedValue([
      { id: "m-admin", politicianId: "p-admin", isClaimant: true },
      { id: "m-auto", politicianId: "p-auto", isClaimant: false },
    ]);
    h.auditLogFindMany.mockResolvedValue([{ entityId: "m-admin" }]);

    await syncFactchecks({ politician: "exemple", force: true });

    expect(h.auditLogFindMany).toHaveBeenCalledWith({
      where: { entityType: "FactCheckMention", entityId: { in: ["m-admin", "m-auto"] } },
      select: { entityId: true },
    });
    expect(h.mentionDeleteMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: { in: ["m-auto"] } },
    });
    // The target is linked as the fallback mention, created rather than replacing the others.
    expect(h.mentionCreate).toHaveBeenCalledExactlyOnceWith({
      data: {
        factCheckId: "f-reecrit",
        politicianId: "p1",
        matchedName: "Camille Exemple",
        isClaimant: false,
      },
    });
    expect(h.factCheckUpsert.mock.calls[0]![0].update).not.toHaveProperty("mentions");
  });

  it("sans --force, ne lit pas les mentions existantes et ne demande que les fact-checks", async () => {
    await syncFactchecks({ politician: "exemple" });

    expect(h.mentionFindMany).not.toHaveBeenCalled();
    expect(h.requestProfileRefresh).toHaveBeenCalledExactlyOnceWith(
      { factCheckIds: ["f-nouveau"] },
      "sync:factchecks"
    );
  });

  it("ne demande rien en simulation", async () => {
    await syncFactchecks({ politician: "exemple", dryRun: true });

    expect(h.requestProfileRefresh).not.toHaveBeenCalled();
  });
});
