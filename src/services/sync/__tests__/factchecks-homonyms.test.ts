import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  factCheckCreate: vi.fn(),
  searchClaims: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    factCheck: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: h.factCheckCreate,
    },
  },
}));
// The theme classifier calls Mistral: never from a test.
vi.mock("@/services/classify-theme", () => ({
  classifyFactCheckTheme: vi.fn().mockResolvedValue({ status: "theme", theme: "SANTE" }),
}));
vi.mock("@/lib/api", () => ({
  searchClaims: h.searchClaims,
  mapTextualRating: () => "FALSE",
  fetchPageTitle: vi.fn(),
}));
// A minister and a village mayor sharing a full name: any name match returns both.
vi.mock("@/lib/name-matching", () => ({
  normalizeText: (s: string) => s.toLowerCase(),
  buildPoliticianIndex: async () => [
    {
      id: "ministre",
      fullName: "Camille Exemple",
      normalizedFullName: "camille exemple",
      normalizedLastName: "exemple",
    },
    {
      id: "maire",
      fullName: "Camille Exemple",
      normalizedFullName: "camille exemple",
      normalizedLastName: "exemple",
    },
  ],
  findMentions: () => [
    { politicianId: "ministre", matchedName: "Camille Exemple" },
    { politicianId: "maire", matchedName: "Camille Exemple" },
  ],
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
  requestProfileRefresh: vi.fn().mockResolvedValue({ sent: 1, mode: "targeted" }),
}));

import { syncFactchecks } from "../factchecks";

const claim = {
  text: "Une affirmation fictive",
  claimant: "Camille Exemple, ministre",
  claimDate: null,
  claimReview: [
    {
      url: "https://example.org/verif-homonyme",
      title: "Vérification fictive",
      publisher: { name: "AFP Factuel" },
      textualRating: "Faux",
      reviewDate: "2026-01-01",
      languageCode: "fr",
    },
  ],
};

describe("syncFactchecks et les homonymes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.factCheckCreate.mockResolvedValue({ id: "f-nouveau" });
  });

  it("n'attribue la déclaration qu'à la personne recherchée, pas à son homonyme", async () => {
    // The first search (the minister, first in the index) returns the claim.
    h.searchClaims.mockResolvedValueOnce([claim]).mockResolvedValue([]);

    const stats = await syncFactchecks({ politician: "exemple", limit: 1 });

    const data = h.factCheckCreate.mock.calls[0]![0].data;
    // A new fact-check is classified on creation.
    expect(data.theme).toBe("SANTE");
    expect(data.themeClassifiedAt).toBeInstanceOf(Date);
    expect(stats.themesClassified).toBe(1);
    const mentions = data.mentions.create;
    expect(mentions).toEqual([
      { politicianId: "ministre", matchedName: "Camille Exemple", isClaimant: true },
    ]);
    // One homonym dropped from the mentions, one from the claimants.
    expect(stats.homonymsSkipped).toBe(2);
  });
});
