import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  parliamentaryGroup: { findMany: vi.fn(), findUnique: vi.fn() },
}));

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import { getGroupeDetail, getGroupesListing } from "@/lib/data/groupes";

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
});
