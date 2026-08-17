import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  politicianFindFirst: vi.fn(),
  partyFindFirst: vi.fn(),
}));

vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    politician: { findFirst: mocks.politicianFindFirst },
    party: { findFirst: mocks.partyFindFirst },
  },
}));
vi.mock("@/services/voteStats", () => ({ getPoliticianVotingStats: vi.fn() }));

import { getPreview, loadComparisonData } from "@/lib/data/compare";

const publicMinister = (slug: string) => ({
  id: `id-${slug}`,
  slug,
  fullName: slug,
  photoUrl: null,
  currentParty: null,
  _count: { factCheckMentions: 0 },
  mandates: [
    {
      type: "MINISTRE",
      title: "Ministre",
      isCurrent: true,
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: null,
      governmentData: null,
      constituency: null,
      departmentCode: null,
      parliamentaryData: null,
    },
  ],
  affairs: [],
  declarations: [],
  factCheckMentions: [],
});

describe("comparaisons publiques MCP", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exclut les personnalités non publiées et leurs fact-checks des comparaisons", async () => {
    mocks.politicianFindFirst
      .mockResolvedValueOnce(publicMinister("ministre-a"))
      .mockResolvedValueOnce(publicMinister("ministre-b"));

    const comparison = await loadComparisonData("ministres", "ministre-a", "ministre-b");

    expect(comparison).not.toBeNull();
    for (const [query] of mocks.politicianFindFirst.mock.calls) {
      expect(query.where).toEqual({ slug: expect.any(String), publicationStatus: "PUBLISHED" });
      expect(query.select._count.select.factCheckMentions.where).toEqual({
        isClaimant: true,
        factCheck: expect.objectContaining({
          publicationStatus: "PUBLISHED",
          source: expect.objectContaining({ in: expect.any(Array) }),
        }),
      });
      expect(query.select.factCheckMentions.where).toEqual({
        isClaimant: true,
        factCheck: expect.objectContaining({
          publicationStatus: "PUBLISHED",
          source: expect.objectContaining({ in: expect.any(Array) }),
        }),
      });
    }
  });

  it("refuse l'aperçu d'un parti sans personnalité publiée", async () => {
    mocks.partyFindFirst.mockResolvedValue(null);

    await expect(getPreview("partis", "parti-draft-only")).resolves.toBeNull();
    expect(mocks.partyFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          politicians: { some: { publicationStatus: "PUBLISHED" } },
          OR: [{ slug: "parti-draft-only" }, { id: "parti-draft-only" }],
        },
        select: expect.objectContaining({
          _count: {
            select: { politicians: { where: { publicationStatus: "PUBLISHED" } } },
          },
        }),
      })
    );
  });
});
