import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  factCheckFindUnique: vi.fn(),
  factCheckFindFirst: vi.fn(),
  factCheckCreate: vi.fn(),
  mentionFindUnique: vi.fn(),
  mentionCreate: vi.fn(),
  searchClaims: vi.fn(),
  requestProfileRefresh: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    factCheck: {
      findUnique: h.factCheckFindUnique,
      findFirst: h.factCheckFindFirst,
      create: h.factCheckCreate,
    },
    factCheckMention: { findUnique: h.mentionFindUnique, create: h.mentionCreate },
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
    h.mentionFindUnique.mockResolvedValue(null);
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

  it("ne demande rien en simulation", async () => {
    await syncFactchecks({ politician: "exemple", dryRun: true });

    expect(h.requestProfileRefresh).not.toHaveBeenCalled();
  });
});
