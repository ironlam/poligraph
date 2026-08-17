import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  partyFindFirst: vi.fn(),
  partyFindMany: vi.fn(),
}));

vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    party: { findFirst: mocks.partyFindFirst, findMany: mocks.partyFindMany },
  },
}));

import { getParties, getParty } from "@/lib/data/partis";

describe("données HTML publiques des partis", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retourne null pour un slug qui ne satisfait pas la frontière publique", async () => {
    mocks.partyFindFirst.mockResolvedValue(null);

    await expect(getParty("parti-draft-only")).resolves.toBeNull();
    expect(mocks.partyFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          slug: "parti-draft-only",
          politicians: { some: { publicationStatus: "PUBLISHED" } },
        },
        include: expect.objectContaining({
          politicians: expect.objectContaining({ where: { publicationStatus: "PUBLISHED" } }),
          partyMemberships: expect.objectContaining({
            where: { politician: { publicationStatus: "PUBLISHED" } },
          }),
          successors: { where: { politicians: { some: { publicationStatus: "PUBLISHED" } } } },
        }),
      })
    );
  });

  it("masque un prédécesseur non public", async () => {
    mocks.partyFindFirst.mockResolvedValue({
      id: "party-public",
      slug: "parti-public",
      politicians: [],
      partyMemberships: [],
      affairsAtTime: [],
      predecessor: {
        id: "party-draft-only",
        slug: "parti-predecesseur-interne",
        _count: { politicians: 0 },
      },
      successors: [],
      externalIds: [],
      pressMentions: [],
    });

    const party = await getParty("parti-public-avec-predecesseur-interne");

    expect(party?.predecessor).toBeNull();
  });

  it("écarte les affaires publiées d'une personnalité DRAFT sur un parti public", async () => {
    const publicPolitician = {
      id: "politician-a",
      slug: "personnalite-a",
      fullName: "Personnalité A",
      publicationStatus: "PUBLISHED",
      mandates: [],
      _count: { affairs: 0 },
    };
    const draftPolitician = {
      id: "politician-b",
      slug: "personnalite-b-interne",
      fullName: "Personnalité B interne",
      publicationStatus: "DRAFT",
    };
    const hiddenAffair = {
      id: "affair-f",
      slug: "affaire-f-interne",
      title: "Affaire F interne",
      involvement: "DIRECT",
      publicationStatus: "PUBLISHED",
      partyAtTimeId: "party-p",
      politician: draftPolitician,
      politicianId: draftPolitician.id,
      sourceUrl: "/affaires/affaire-f-interne",
      fineAmount: null,
    };
    const publicParty = {
      id: "party-p",
      slug: "parti-p-public",
      name: "Parti P",
      politicians: [publicPolitician],
      partyMemberships: [],
      predecessor: null,
      successors: [],
      externalIds: [],
      pressMentions: [],
    };

    mocks.partyFindFirst.mockImplementation(async (query) => ({
      ...publicParty,
      affairsAtTime:
        query.include.affairsAtTime.where.politician?.publicationStatus === "PUBLISHED"
          ? []
          : [hiddenAffair],
    }));
    mocks.partyFindMany.mockImplementation(async (query) => [
      {
        ...publicParty,
        _count: { politicians: 1, partyMemberships: 1 },
        affairsAtTime:
          query.include.affairsAtTime.where.politician?.publicationStatus === "PUBLISHED"
            ? []
            : [hiddenAffair],
      },
    ]);

    const detail = await getParty(publicParty.slug);
    const listing = await getParties();
    const serializedDetail = JSON.stringify(detail);

    expect(detail?.slug).toBe(publicParty.slug);
    expect(detail?.politicians.map((politician) => politician.slug)).toEqual([
      publicPolitician.slug,
    ]);
    expect(detail?.affairsAtTime).toEqual([]);
    expect(serializedDetail).not.toContain(draftPolitician.slug);
    expect(serializedDetail).not.toContain(draftPolitician.fullName);
    expect(serializedDetail).not.toContain(hiddenAffair.slug);
    expect(serializedDetail).not.toContain(hiddenAffair.title);
    expect(serializedDetail).not.toContain(hiddenAffair.sourceUrl);

    expect(listing).toHaveLength(1);
    expect(listing[0]?.slug).toBe(publicParty.slug);
    expect(listing[0]?.affairCounts).toEqual({
      condamnations: 0,
      enCours: 0,
      closesSansCondamnation: 0,
      total: 0,
    });
    const serializedListing = JSON.stringify(listing);
    expect(serializedListing).not.toContain(draftPolitician.slug);
    expect(serializedListing).not.toContain(draftPolitician.fullName);
    expect(serializedListing).not.toContain(hiddenAffair.slug);
    expect(serializedListing).not.toContain(hiddenAffair.title);
    expect(serializedListing).not.toContain(hiddenAffair.sourceUrl);

    const detailQuery = mocks.partyFindFirst.mock.calls.at(-1)?.[0];
    const listingQuery = mocks.partyFindMany.mock.calls.at(-1)?.[0];
    expect(detailQuery.where).toEqual({
      slug: publicParty.slug,
      politicians: { some: { publicationStatus: "PUBLISHED" } },
    });
    expect(detailQuery.include.affairsAtTime.where).toEqual({
      publicationStatus: "PUBLISHED",
      politician: { publicationStatus: "PUBLISHED" },
    });
    expect(listingQuery.include.affairsAtTime.where).toEqual({
      publicationStatus: "PUBLISHED",
      politician: { publicationStatus: "PUBLISHED" },
      involvement: { notIn: ["VICTIM", "PLAINTIFF"] },
    });
  });
});
