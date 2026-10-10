import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  factCheckFindUnique: vi.fn(),
  factCheckFindFirst: vi.fn(),
  factCheckCreate: vi.fn(),
  factCheckUpsert: vi.fn(),
  mentionFindMany: vi.fn(),
  mentionFindUnique: vi.fn(),
  mentionCreate: vi.fn(),
  searchClaims: vi.fn(),
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
    },
  },
}));
vi.mock("@/lib/api", () => ({
  searchClaims: h.searchClaims,
  mapTextualRating: () => "MOSTLY_TRUE",
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
  requestProfileRefresh: vi.fn(),
}));

import { isOwnSiteUrl, syncFactchecks } from "../factchecks";

// Shape Google returns once it has indexed the ClaimReview JSON-LD of one of
// our own fact-check pages: our og:title, our name as publisher.
function review(url: string) {
  return {
    url,
    title: "Plutôt vrai : une vérification fictive",
    publisher: { name: "Poligraph" },
    textualRating: "Plutôt vrai",
    reviewDate: "2026-01-01",
    languageCode: "fr",
  };
}

function claimWith(...reviews: ReturnType<typeof review>[]) {
  return { text: "Une affirmation fictive", claimant: null, claimDate: null, claimReview: reviews };
}

describe("isOwnSiteUrl", () => {
  it("recognises our host and its subdomains", () => {
    expect(isOwnSiteUrl("https://poligraph.fr/factchecks/une-verif")).toBe(true);
    expect(isOwnSiteUrl("https://www.poligraph.fr/factchecks/une-verif")).toBe(true);
    expect(isOwnSiteUrl("https://POLIGRAPH.FR/factchecks/une-verif")).toBe(true);
  });

  it("compares the hostname, not a substring of the URL", () => {
    expect(isOwnSiteUrl("https://notpoligraph.fr/article")).toBe(false);
    expect(isOwnSiteUrl("https://poligraph.fr.example.org/article")).toBe(false);
    expect(isOwnSiteUrl("https://example.org/?ref=poligraph.fr")).toBe(false);
  });

  it("treats an unparseable URL as foreign instead of throwing", () => {
    expect(isOwnSiteUrl("pas une url")).toBe(false);
    expect(isOwnSiteUrl("")).toBe(false);
  });
});

describe("syncFactchecks et nos propres pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.factCheckFindUnique.mockResolvedValue(null);
    h.factCheckFindFirst.mockResolvedValue(null);
    h.factCheckCreate.mockResolvedValue({ id: "f-nouveau" });
    h.factCheckUpsert.mockResolvedValue({ id: "f-reecrit" });
    h.mentionFindMany.mockResolvedValue([]);
    h.mentionFindUnique.mockResolvedValue(null);
  });

  it("n'importe pas une review qui pointe vers poligraph.fr", async () => {
    h.searchClaims.mockResolvedValue([
      claimWith(
        review("https://poligraph.fr/factchecks/une-verif"),
        review("https://www.poligraph.fr/factchecks/une-autre")
      ),
    ]);

    const stats = await syncFactchecks({ politician: "exemple" });

    expect(h.factCheckCreate).not.toHaveBeenCalled();
    // Nor merged as mentions into the original fact-check found by title.
    expect(h.factCheckFindFirst).not.toHaveBeenCalled();
    expect(h.mentionCreate).not.toHaveBeenCalled();
    expect(stats.ownSiteSkipped).toBe(2);
    expect(stats.factChecksCreated).toBe(0);
  });

  it("ne réécrit pas non plus nos pages avec --force", async () => {
    h.searchClaims.mockResolvedValue([
      claimWith(review("https://poligraph.fr/factchecks/une-verif")),
    ]);

    await syncFactchecks({ politician: "exemple", force: true });

    expect(h.factCheckUpsert).not.toHaveBeenCalled();
  });

  it("importe toujours la review du vrai média à côté", async () => {
    h.searchClaims.mockResolvedValue([
      claimWith(review("https://poligraph.fr/factchecks/une-verif"), {
        ...review("https://example.org/verif-fictive"),
        publisher: { name: "AFP Factuel" },
      }),
    ]);

    const stats = await syncFactchecks({ politician: "exemple" });

    expect(h.factCheckCreate).toHaveBeenCalledTimes(1);
    expect(h.factCheckCreate.mock.calls[0]![0].data.sourceUrl).toBe(
      "https://example.org/verif-fictive"
    );
    expect(stats.ownSiteSkipped).toBe(1);
    expect(stats.apiErrors).toBe(0);
  });
});
