import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  politicianFindMany: vi.fn(),
  politicianCount: vi.fn(),
  partyFindMany: vi.fn(),
  partyCount: vi.fn(),
  affairCount: vi.fn(),
  scrutinCount: vi.fn(),
  factCheckCount: vi.fn(),
  groupFindMany: vi.fn(),
  electionFindUnique: vi.fn(),
}));

vi.mock("next/cache", () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    politician: { findMany: mocks.politicianFindMany, count: mocks.politicianCount },
    party: { findMany: mocks.partyFindMany, count: mocks.partyCount },
    affair: { count: mocks.affairCount },
    scrutin: { count: mocks.scrutinCount },
    factCheck: { count: mocks.factCheckCount },
    parliamentaryGroup: { findMany: mocks.groupFindMany },
    election: { findUnique: mocks.electionFindUnique },
  },
}));

import { GET as getStats } from "@/app/api/stats/route";
import { GET as searchParties } from "@/app/api/search/parties/route";
import { GET as getCompareIndex } from "@/app/api/compare/search-index/route";
import { GET as getElection } from "@/app/api/elections/[slug]/route";

const context = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });

describe("MCP party public boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.politicianFindMany.mockResolvedValue([]);
    mocks.politicianCount.mockResolvedValue(0);
    mocks.partyFindMany.mockResolvedValue([]);
    mocks.partyCount.mockResolvedValue(0);
    mocks.affairCount.mockResolvedValue(0);
    mocks.scrutinCount.mockResolvedValue(0);
    mocks.factCheckCount.mockResolvedValue(0);
    mocks.groupFindMany.mockResolvedValue([]);
  });

  it("exclut de la recherche un parti qui ne possède que des personnalités DRAFT", async () => {
    const response = await searchParties(
      new NextRequest("https://poligraph.fr/api/search/parties?q=test"),
      context()
    );

    expect(await response.json()).toEqual([]);
    expect(mocks.partyFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          politicians: { some: { publicationStatus: "PUBLISHED" } },
        }),
        select: expect.objectContaining({
          _count: {
            select: { politicians: { where: { publicationStatus: "PUBLISHED" } } },
          },
        }),
      })
    );
  });

  it("retourne un parti public et compte uniquement ses membres publiés", async () => {
    mocks.partyFindMany.mockResolvedValue([
      {
        id: "party-public",
        name: "Parti public",
        shortName: "PP",
        slug: "parti-public",
        color: null,
        logoUrl: null,
        _count: { politicians: 1 },
      },
    ]);

    const response = await searchParties(
      new NextRequest("https://poligraph.fr/api/search/parties?q=public"),
      context()
    );

    expect(await response.json()).toEqual([
      expect.objectContaining({ slug: "parti-public", memberCount: 1 }),
    ]);
  });

  it("applique la même frontière au compteur global et à l'index de comparaison", async () => {
    await getStats(new NextRequest("https://poligraph.fr/api/stats"), context());

    expect(mocks.partyCount).toHaveBeenCalledWith({
      where: { politicians: { some: { publicationStatus: "PUBLISHED" } } },
    });

    await getCompareIndex(
      new NextRequest("https://poligraph.fr/api/compare/search-index"),
      context()
    );

    expect(mocks.partyFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          politicians: { some: { publicationStatus: "PUBLISHED" } },
          dissolvedDate: null,
        },
        select: expect.objectContaining({
          _count: {
            select: { politicians: { where: { publicationStatus: "PUBLISHED" } } },
          },
        }),
      })
    );
  });

  it("sérialise à null un parti imbriqué non public dans une élection", async () => {
    mocks.electionFindUnique.mockResolvedValue({
      id: "election-1",
      slug: "election-test",
      candidacies: [
        {
          id: "candidacy-draft-party",
          candidateName: "Candidate",
          politician: null,
          party: {
            id: "party-draft-only",
            slug: "parti-interne",
            shortName: "PI",
            color: null,
            _count: { politicians: 0 },
          },
        },
      ],
      rounds: [],
    });

    const response = await getElection(
      new NextRequest("https://poligraph.fr/api/elections/election-test"),
      context({ slug: "election-test" })
    );
    const payload = await response.json();

    expect(payload.candidacies[0].party).toBeNull();
    expect(mocks.electionFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          candidacies: expect.objectContaining({
            select: expect.objectContaining({
              party: {
                select: expect.objectContaining({
                  _count: {
                    select: {
                      politicians: { where: { publicationStatus: "PUBLISHED" } },
                    },
                  },
                }),
              },
            }),
          }),
        }),
      })
    );
  });
});
