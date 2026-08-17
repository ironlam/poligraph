import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  parliamentaryGroup: { findMany: vi.fn(), findUnique: vi.fn() },
  scrutinGroupPosition: { findMany: vi.fn() },
}));

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import { getGroupeDetail, getGroupesListing, getGroupKeyVotes } from "@/lib/data/groupes";

const staleStats = {
  id: "stats-1",
  groupId: "group-1",
  legislature: 2023,
  cohesionPct: 88,
  governmentAlignmentPct: 42,
  finalVoteAlignmentPct: 40,
  averageParticipationPct: 100,
  computedAt: new Date(),
  updatedAt: new Date(),
};

describe("frontières publiques des groupes parlementaires", () => {
  beforeEach(() => vi.clearAllMocks());

  it("neutralise une ancienne moyenne Sénat dans la liste", async () => {
    dbMock.parliamentaryGroup.findMany.mockResolvedValue([
      {
        id: "group-1",
        code: "LR",
        name: "Les Républicains",
        shortName: "LR",
        color: null,
        slug: "lr-senat",
        chamber: "SENAT",
        politicalPosition: null,
        stats: [staleStats],
        _count: { mandates: 20 },
      },
    ]);

    const groups = await getGroupesListing({ chamber: "SENAT" });

    expect(groups[0]?.stats?.averageParticipationPct).toBeNull();
    expect(groups[0]?.stats?.cohesionPct).toBe(88);
  });

  it("neutralise la même ligne dans le détail", async () => {
    dbMock.parliamentaryGroup.findUnique.mockResolvedValue({
      id: "group-1",
      code: "LR",
      name: "Les Républicains",
      slug: "lr-senat",
      chamber: "SENAT",
      stats: [staleStats],
      mandates: [],
    });

    const group = await getGroupeDetail("lr-senat");

    expect(group?.stats[0]?.averageParticipationPct).toBeNull();
    expect(group?.stats[0]?.cohesionPct).toBe(88);
  });

  it("ne retourne que les membres publiés avec leur parti courant lié", async () => {
    dbMock.parliamentaryGroup.findUnique.mockImplementation(async (args) => {
      const publicOnly = JSON.stringify(args).includes(
        '"politician":{"publicationStatus":"PUBLISHED"}'
      );
      const publicMember = {
        mandate: {
          politician: {
            id: "public-member",
            slug: "alice-publique",
            firstName: "Alice",
            lastName: "Publique",
            fullName: "Alice Publique",
            photoUrl: null,
            currentParty: { shortName: "PP" },
          },
        },
      };
      const draftMember = {
        mandate: {
          politician: {
            id: "draft-member",
            slug: "bastien-brouillon",
            firstName: "Bastien",
            lastName: "Brouillon",
            fullName: "Bastien Brouillon",
            photoUrl: null,
            currentParty: { shortName: "PI" },
          },
        },
      };
      return {
        id: "group-1",
        slug: "groupe-public",
        stats: [],
        mandates: publicOnly ? [publicMember] : [publicMember, draftMember],
      } as never;
    });

    const group = await getGroupeDetail("groupe-public");

    expect(group?.members).toEqual([
      expect.objectContaining({
        id: "public-member",
        fullName: "Alice Publique",
        currentParty: { shortName: "PP" },
      }),
    ]);
    expect(group?.seatCount).toBe(1);
    expect(JSON.stringify(group)).not.toContain("Bastien Brouillon");
    expect(JSON.stringify(group)).not.toContain('"shortName":"PI"');
  });

  it("sélectionne les attributs réels nécessaires aux cartes de scrutins", async () => {
    dbMock.scrutinGroupPosition.findMany.mockResolvedValue([]);

    await getGroupKeyVotes("group-1");

    expect(dbMock.scrutinGroupPosition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          scrutin: {
            select: expect.objectContaining({
              externalId: true,
              legislature: true,
              chamber: true,
              sourceUrl: true,
            }),
          },
        },
      })
    );
  });
});
