import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  partyFindMany: vi.fn(),
  partyFindFirst: vi.fn(),
  affairFindMany: vi.fn(),
  affairCount: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    party: { findMany: mocks.partyFindMany, findFirst: mocks.partyFindFirst },
    affair: { findMany: mocks.affairFindMany, count: mocks.affairCount },
  },
}));

import {
  getAffairsFiltered,
  getPartiesWithAffairs,
  getPublicPartyMetadataBySlug,
  searchAffairs,
} from "./affairs";

describe("getPartiesWithAffairs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.affairCount.mockResolvedValue(0);
  });

  it("charge les metadata d'un parti uniquement derrière la frontière publique", async () => {
    mocks.partyFindFirst.mockImplementation(async (args: unknown) => {
      const publicOnly = JSON.stringify(args).includes(
        '"politicians":{"some":{"publicationStatus":"PUBLISHED"}}'
      );
      return publicOnly ? null : { name: "Parti interne", shortName: "PI" };
    });

    await expect(getPublicPartyMetadataBySlug("parti-interne")).resolves.toBeNull();
    expect(mocks.partyFindFirst).toHaveBeenCalledWith({
      where: {
        slug: "parti-interne",
        politicians: { some: { publicationStatus: "PUBLISHED" } },
      },
      select: { name: true, shortName: true },
    });

    mocks.partyFindFirst.mockResolvedValue({ name: "Parti public", shortName: "PP" });
    await expect(getPublicPartyMetadataBySlug("parti-public")).resolves.toEqual({
      name: "Parti public",
      shortName: "PP",
    });
  });

  it("écarte les partis et affaires qui ne franchissent pas toutes les frontières publiques", async () => {
    mocks.partyFindMany.mockImplementation(async (args: unknown) => {
      const serialized = JSON.stringify(args);
      const partyIsPublic = serialized.includes(
        '"politicians":{"some":{"publicationStatus":"PUBLISHED"}}'
      );
      const affairsUsePublishedPoliticians = serialized.includes(
        '"politician":{"publicationStatus":"PUBLISHED"}'
      );
      if (!partyIsPublic || !affairsUsePublishedPoliticians) {
        return [
          {
            slug: "parti-interne",
            name: "Parti interne",
            shortName: "PI",
            color: null,
            _count: { affairsAtTime: 1 },
            affairTitle: "Affaire masquée",
            affairSlug: "affaire-masquee",
          },
          {
            slug: "parti-public",
            name: "Parti public",
            shortName: "PP",
            color: null,
            _count: { affairsAtTime: 2 },
          },
        ] as never;
      }
      return [
        {
          slug: "parti-public",
          name: "Parti public",
          shortName: "PP",
          color: null,
          _count: { affairsAtTime: 1 },
        },
      ] as never;
    });

    const parties = await getPartiesWithAffairs();

    expect(parties).toEqual([
      expect.objectContaining({
        slug: "parti-public",
        name: "Parti public",
        _count: { affairsAtTime: 1 },
      }),
    ]);
    const serialized = JSON.stringify(parties);
    expect(serialized).not.toContain("parti-interne");
    expect(serialized).not.toContain("Affaire masquée");
    expect(serialized).not.toContain("affaire-masquee");
    expect(mocks.partyFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          politicians: { some: { publicationStatus: "PUBLISHED" } },
          affairsAtTime: {
            some: expect.objectContaining({
              publicationStatus: "PUBLISHED",
              politician: { publicationStatus: "PUBLISHED" },
            }),
          },
        }),
        select: expect.objectContaining({
          _count: {
            select: {
              affairsAtTime: {
                where: expect.objectContaining({
                  publicationStatus: "PUBLISHED",
                  politician: { publicationStatus: "PUBLISHED" },
                }),
              },
            },
          },
        }),
      })
    );
  });

  it("conserve l'affaire publique tout en neutralisant son parti historique non public", async () => {
    mocks.affairFindMany.mockImplementation(async (args: { where?: unknown }) => {
      const serialized = JSON.stringify(args.where);
      const publicOnly =
        serialized.includes('"publicationStatus":"PUBLISHED"') &&
        serialized.includes('"politician":{"publicationStatus":"PUBLISHED"}');

      if (!publicOnly) {
        return [
          { id: "draft-affair", title: "Affaire DRAFT", fineAmount: null, partyAtTime: null },
        ] as never;
      }

      return [
        {
          id: "public-hidden-party",
          title: "Affaire publique, parti masqué",
          fineAmount: null,
          partyAtTime: {
            id: "party-draft",
            slug: "parti-draft",
            shortName: "PD",
            name: "Parti DRAFT",
            color: "#123456",
            _count: { politicians: 0 },
          },
        },
        {
          id: "public-public-party",
          title: "Affaire et parti publics",
          fineAmount: null,
          partyAtTime: {
            id: "party-public",
            slug: "parti-public",
            shortName: "PP",
            name: "Parti public",
            color: "#654321",
            _count: { politicians: 2 },
          },
        },
      ] as never;
    });
    mocks.affairCount.mockResolvedValue(2);

    const result = await searchAffairs("affaire");

    expect(result.affairs).toHaveLength(2);
    expect(result.affairs[0]).toMatchObject({
      id: "public-hidden-party",
      title: "Affaire publique, parti masqué",
      partyAtTime: null,
    });
    expect(result.affairs[1]).toMatchObject({
      id: "public-public-party",
      partyAtTime: {
        id: "party-public",
        slug: "parti-public",
        shortName: "PP",
        name: "Parti public",
        color: "#654321",
      },
    });
    expect(JSON.stringify(result)).not.toContain("party-draft");
    expect(JSON.stringify(result)).not.toContain("Parti DRAFT");
    expect(JSON.stringify(result)).not.toContain("Affaire DRAFT");
  });

  it("traite un filtre sur un parti caché comme inexistant et conserve un parti public", async () => {
    const publicAffair = {
      id: "public-public-party",
      title: "Affaire et parti publics",
      fineAmount: null,
      partyAtTime: {
        id: "party-public",
        slug: "parti-public",
        shortName: "PP",
        name: "Parti public",
        color: "#654321",
        _count: { politicians: 1 },
      },
    };

    mocks.affairFindMany.mockImplementation(async (args: { where?: unknown }) => {
      const where = JSON.stringify(args.where);
      const hasPublicPartyBoundary = where.includes(
        '"partyAtTime":{"slug":"parti-public","politicians":{"some":{"publicationStatus":"PUBLISHED"}}}'
      );
      return (hasPublicPartyBoundary ? [publicAffair] : []) as never;
    });
    mocks.affairCount.mockImplementation(async (args: { where?: unknown }) => {
      const where = JSON.stringify(args.where);
      return where.includes(
        '"partyAtTime":{"slug":"parti-public","politicians":{"some":{"publicationStatus":"PUBLISHED"}}}'
      )
        ? 1
        : 0;
    });

    const hidden = await getAffairsFiltered(
      undefined,
      undefined,
      undefined,
      undefined,
      1,
      ["DIRECT"],
      "parti-interne"
    );
    const visible = await getAffairsFiltered(
      undefined,
      undefined,
      undefined,
      undefined,
      1,
      ["DIRECT"],
      "parti-public"
    );

    expect(hidden).toMatchObject({ affairs: [], total: 0 });
    expect(visible).toMatchObject({
      total: 1,
      affairs: [expect.objectContaining({ id: "public-public-party" })],
    });
    expect(mocks.affairFindMany.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          partyAtTime: {
            slug: "parti-interne",
            politicians: { some: { publicationStatus: "PUBLISHED" } },
          },
        }),
      })
    );
  });
});
