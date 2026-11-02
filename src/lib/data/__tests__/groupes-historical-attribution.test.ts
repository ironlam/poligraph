import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  parliamentaryGroup: { findUnique: vi.fn(), findMany: vi.fn() },
  scrutinGroupPosition: { findMany: vi.fn() },
  scrutinAnalysis: { findUnique: vi.fn() },
  governmentProjects: vi.fn(),
}));

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/data/government-project-positions", () => ({
  getGovernmentProjectPositionDataset: dbMock.governmentProjects,
}));

import {
  getGroupeDetail,
  getGroupesListing,
  getGroupKeyVotes,
  getScrutinAnalysis,
  getScrutinGroupPositions,
  getScrutinGroupPositionsBatch,
} from "@/lib/data/groupes";

function row(
  id: string,
  scrutinId: string,
  scrutin: { chamber: "AN" | "SENAT"; legislature: number },
  group: { chamber: "AN" | "SENAT"; legislature: number | null }
) {
  return {
    id,
    scrutinId,
    position: "POUR",
    forCount: 10,
    againstCount: 0,
    abstainCount: 0,
    cohesionPct: 100,
    scrutin,
    group: {
      id: `g-${id}`,
      code: "SOC",
      name: "Socialistes",
      shortName: null,
      color: null,
      slug: "soc-an-17",
      ...group,
    },
  };
}

describe("positions de groupe : pas d'attribution anachronique", () => {
  beforeEach(() => vi.clearAllMocks());

  it("n'expose pas un vote de la 16e sous un groupe de la 17e", async () => {
    dbMock.scrutinGroupPosition.findMany.mockResolvedValue([
      row("old", "s16", { chamber: "AN", legislature: 16 }, { chamber: "AN", legislature: 17 }),
    ]);

    expect(await getScrutinGroupPositions("s16")).toEqual([]);
  });

  it("garde la position d'un scrutin de la 17e et retire les champs de contrôle", async () => {
    dbMock.scrutinGroupPosition.findMany.mockResolvedValue([
      row("ok", "s17", { chamber: "AN", legislature: 17 }, { chamber: "AN", legislature: 17 }),
    ]);

    const [position] = await getScrutinGroupPositions("s17");

    expect(position?.id).toBe("ok");
    expect(position).not.toHaveProperty("scrutin");
    expect(position?.group).not.toHaveProperty("legislature");
    expect(position?.group).not.toHaveProperty("chamber");
  });

  it("filtre aussi le listing par lot", async () => {
    dbMock.scrutinGroupPosition.findMany.mockResolvedValue([
      row("old", "s16", { chamber: "AN", legislature: 16 }, { chamber: "AN", legislature: 17 }),
      row("ok", "s17", { chamber: "AN", legislature: 17 }, { chamber: "AN", legislature: 17 }),
    ]);

    const map = await getScrutinGroupPositionsBatch(["s16", "s17"]);

    expect(map.has("s16")).toBe(false);
    expect(map.get("s17")?.map((p) => p.id)).toEqual(["ok"]);
  });

  it("limite les votes clés d'un groupe AN à sa propre législature", async () => {
    dbMock.parliamentaryGroup.findUnique.mockResolvedValue({ chamber: "AN", legislature: 17 });
    dbMock.scrutinGroupPosition.findMany.mockResolvedValue([]);

    await getGroupKeyVotes("g1");

    expect(dbMock.scrutinGroupPosition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId: "g1", scrutin: { legislature: 17 } },
      })
    );
  });

  it("ne publie aucun vote clé pour un groupe AN sans législature", async () => {
    dbMock.parliamentaryGroup.findUnique.mockResolvedValue({ chamber: "AN", legislature: null });

    expect(await getGroupKeyVotes("g1")).toEqual([]);
    expect(dbMock.scrutinGroupPosition.findMany).not.toHaveBeenCalled();
  });

  it("retient l'analyse IA d'un scrutin de la 16e", async () => {
    dbMock.scrutinAnalysis.findUnique.mockResolvedValue({
      argumentsFor: "Le groupe SOC soutient le texte.",
      argumentsAgainst: "",
      sourceType: "DEBATE_TRANSCRIPT",
      modelVersion: "m",
      scrutin: { chamber: "AN", legislature: 16 },
    });

    expect(await getScrutinAnalysis("s16")).toBeNull();
  });

  it("publie l'analyse d'un scrutin de la 17e sans exposer le scrutin", async () => {
    dbMock.scrutinAnalysis.findUnique.mockResolvedValue({
      argumentsFor: "a",
      argumentsAgainst: "b",
      sourceType: "STRUCTURED_DATA",
      modelVersion: "m",
      scrutin: { chamber: "AN", legislature: 17 },
    });

    const analysis = await getScrutinAnalysis("s17");

    expect(analysis).toMatchObject({ argumentsFor: "a" });
    expect(analysis).not.toHaveProperty("scrutin");
  });
});

describe("statistiques de groupe AN persistées", () => {
  const stats = [
    {
      id: "st",
      groupId: "g",
      legislature: 17,
      cohesionPct: 94.5,
      governmentAlignmentPct: 93,
      finalVoteAlignmentPct: 96.9,
      averageParticipationPct: null,
      computedAt: new Date(),
    },
  ];

  beforeEach(() => vi.clearAllMocks());

  it("n'expose pas les valeurs persistées dans la liste", async () => {
    dbMock.parliamentaryGroup.findMany.mockResolvedValue([
      {
        id: "g",
        code: "SOC",
        name: "S",
        shortName: null,
        color: null,
        slug: "soc-an-17",
        chamber: "AN",
        politicalPosition: null,
        stats,
        _count: { mandates: 70 },
      },
    ]);

    const [group] = await getGroupesListing({ chamber: "AN" });

    expect(group?.stats).toBeNull();
    expect(group?.seatCount).toBe(70);
  });

  it("garde les statistiques AN masquées lorsque le nouvel indicateur est chargé", async () => {
    const summary = {
      candidateCount: 2,
      eligibleScrutinCount: 2,
      consideredCount: 2,
      excludedCount: 0,
      groupExcludedCount: 0,
      scopeExcludedCount: 0,
      updatedAt: null,
      counts: { POUR: 1, ABSTENTION: 0, CONTRE: 1 },
      percentages: { POUR: 50, ABSTENTION: 0, CONTRE: 50 },
    };
    dbMock.governmentProjects.mockResolvedValue({
      legislature: 17,
      groups: { SOC: { summary, rows: [] } },
    });
    dbMock.parliamentaryGroup.findMany.mockResolvedValue([
      { id: "g", code: "SOC", chamber: "AN", stats, _count: { mandates: 70 } },
    ]);

    const [group] = await getGroupesListing({
      chamber: "AN",
      includeGovernmentProjectPositions: true,
    });

    expect(group?.stats).toBeNull();
    expect(group?.governmentProjectPositions).toEqual(summary);
  });

  it("n'expose pas les valeurs persistées dans le détail", async () => {
    dbMock.parliamentaryGroup.findUnique.mockResolvedValue({
      id: "g",
      slug: "soc-an-17",
      chamber: "AN",
      stats,
      mandates: [],
    });

    const group = await getGroupeDetail("soc-an-17");

    expect(group?.stats).toEqual([]);
  });
});
