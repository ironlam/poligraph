import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  politicianFindMany: vi.fn(),
  partyFindMany: vi.fn(),
  partyFindFirst: vi.fn(),
  mandateGroupBy: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    politician: { findMany: mocks.politicianFindMany },
    party: {
      findMany: mocks.partyFindMany,
      findFirst: mocks.partyFindFirst,
    },
    mandate: { groupBy: mocks.mandateGroupBy },
  },
}));

import { searchDatabaseByKeywords } from "./keywords";
import { matchPattern } from "./patterns";

function containsPublishedBoundary(value: unknown): boolean {
  return JSON.stringify(value).includes('"publicationStatus":"PUBLISHED"');
}

describe("frontière publique Party du chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("masque le parti interne et la personnalité DRAFT dans la recherche par mots-clés", async () => {
    mocks.politicianFindMany.mockImplementation(async (args: unknown) => {
      const publicOnly = containsPublishedBoundary(args);
      const publicPolitician = {
        civility: "Mme",
        fullName: "Alice Publique",
        slug: "alice-publique",
        currentParty: { name: "Parti Public", shortName: "PP" },
        mandates: [],
      };
      const draftPolitician = {
        civility: "M.",
        fullName: "Bastien Brouillon",
        slug: "bastien-brouillon",
        currentParty: { name: "Parti Public", shortName: "PP" },
        mandates: [],
      };
      return publicOnly ? [publicPolitician] : [publicPolitician, draftPolitician];
    });
    mocks.partyFindMany.mockImplementation(async (args: unknown) => {
      const publicOnly = containsPublishedBoundary(args);
      const filteredCount = containsPublishedBoundary((args as { include?: unknown }).include);
      const publicParty = {
        name: "Parti Public",
        shortName: "PP",
        slug: "parti-public",
        _count: { politicians: filteredCount ? 1 : 2 },
      };
      const internalParty = {
        name: "Parti Secret",
        shortName: "PSX",
        slug: "parti-secret",
        _count: { politicians: 1 },
      };
      return publicOnly ? [publicParty] : [internalParty, publicParty];
    });

    const result = await searchDatabaseByKeywords("groupe public");

    expect(result).toContain("Alice Publique");
    expect(result).toContain("Parti Public");
    expect(result).toContain("1 membre(s)");
    expect(result).not.toContain("Bastien Brouillon");
    expect(result).not.toContain("Parti Secret");
    expect(result).not.toContain("parti-secret");
    expect(result).not.toContain("2 membre(s)");
  });

  it("masque le parti interne et borne les agrégats de membres du pattern dédié", async () => {
    mocks.partyFindFirst.mockImplementation(async (args: unknown) => {
      const serialized = JSON.stringify(args);
      const publicOnly = containsPublishedBoundary(args);
      const filteredCount = containsPublishedBoundary((args as { include?: unknown }).include);
      if (serialized.includes("UDI")) {
        return publicOnly
          ? null
          : {
              id: "internal-party",
              name: "Union Draft Interne",
              shortName: "UDI",
              slug: "union-draft-interne",
              _count: { politicians: 1 },
            };
      }
      return {
        id: "public-party",
        name: "Parti Social Public",
        shortName: "PS",
        slug: "parti-social-public",
        _count: { politicians: filteredCount ? 1 : 2 },
      };
    });
    mocks.mandateGroupBy.mockImplementation(async (args: unknown) => [
      { type: "DEPUTE", _count: containsPublishedBoundary(args) ? 1 : 2 },
    ]);

    const hidden = await matchPattern("membres du UDI");
    const visible = await matchPattern("membres du PS");

    expect(hidden).toBeNull();
    expect(visible).toContain("Parti Social Public");
    expect(visible).toContain("1 membres référencés");
    expect(visible).toContain("Députés : 1");
    expect(visible).not.toContain("2 membres référencés");
    expect(visible).not.toContain("Députés : 2");
  });
});
