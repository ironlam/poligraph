import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  mandate: { findMany: vi.fn() },
  vote: { groupBy: vi.fn(), count: vi.fn() },
  scrutin: { groupBy: vi.fn(), count: vi.fn() },
}));

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import {
  getAnLegislatureWindows,
  getPoliticianAnLegislatures,
  getPoliticianLegislatureVotes,
} from "@/services/politician-legislature-votes";

const L16_START = new Date("2022-07-11T00:00:00.000Z");
const L16_END = new Date("2024-06-07T00:00:00.000Z");

function deputyMandate(id: string, startDate: string, endDate: string | null, isCurrent = false) {
  return {
    id,
    politicianId: "depute",
    type: "DEPUTE",
    startDate: new Date(startDate),
    endDate: endDate ? new Date(endDate) : null,
    isCurrent,
    externalId: null,
  };
}

function votes(rows: Array<[string, string, number]>) {
  return rows.map(([scrutinType, position, _count]) => ({ scrutinType, position, _count }));
}

describe("getPoliticianLegislatureVotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.scrutin.groupBy.mockResolvedValue([
      { legislature: 16, _min: { votingDate: L16_START }, _max: { votingDate: L16_END } },
    ]);
    dbMock.mandate.findMany.mockResolvedValue([deputyMandate("m16", "2022-06-22", "2024-06-09")]);
    dbMock.vote.groupBy.mockResolvedValue(
      votes([
        ["FINAL", "POUR", 3],
        ["AMENDEMENT", "POUR", 2],
        ["AMENDEMENT", "CONTRE", 2],
        ["ARTICLE", "ABSTENTION", 1],
        ["ARTICLE", "NON_VOTANT", 2],
      ])
    );
    dbMock.scrutin.count.mockResolvedValue(20);
    dbMock.vote.count.mockResolvedValue(0);
  });

  it("calcule votes, compteurs et participation sur la même législature", async () => {
    const result = await getPoliticianLegislatureVotes("depute", 16);

    expect(result.counts).toEqual({ total: 10, amendments: 4, nonAmendments: 6 });
    expect(result.stats).toMatchObject({
      total: 10,
      pour: 5,
      contre: 2,
      abstention: 1,
      nonVotant: 2,
      eligibleScrutins: 20,
      participationStatus: "AVAILABLE",
    });
    expect(result.perimeter.issue).toBeNull();
    expect(result.perimeter.periods).toEqual([{ start: L16_START, end: L16_END }]);
  });

  it("exclut le non-votant du numérateur et ne parle pas d'absence", async () => {
    const { stats } = await getPoliticianLegislatureVotes("depute", 16);

    // 8 positions exprimées (5 + 2 + 1) sur 20 scrutins, les 2 non-votants ne comptent pas.
    expect(stats.participationRate).toBe(40);
    // 20 scrutins tenus, 10 lignes de vote : 10 sans position enregistrée.
    expect(stats.scrutinsSansVoteEnregistre).toBe(10);
  });

  it("limite les trois requêtes au même périmètre (législature, Assemblée nationale)", async () => {
    await getPoliticianLegislatureVotes("depute", 16);

    const scope = { legislature: 16, chamber: "AN" };
    expect(dbMock.vote.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { politicianId: "depute", scrutin: scope } })
    );
    expect(dbMock.scrutin.count).toHaveBeenCalledWith({
      where: { ...scope, OR: [{ votingDate: { gte: L16_START, lte: L16_END } }] },
    });
    expect(dbMock.vote.count).toHaveBeenCalledWith({
      where: {
        politicianId: "depute",
        scrutin: scope,
        NOT: { OR: [{ votingDate: { gte: L16_START, lte: L16_END } }] },
      },
    });
  });

  it("ne publie pas de taux sans mandat de député documenté", async () => {
    dbMock.mandate.findMany.mockResolvedValue([]);

    const result = await getPoliticianLegislatureVotes("depute", 16);

    expect(result.perimeter.issue).toBe("NO_MANDATE");
    expect(result.stats).toMatchObject({
      total: 10,
      eligibleScrutins: null,
      participationRate: null,
      scrutinsSansVoteEnregistre: null,
      participationStatus: "COMPUTATION_INCOMPLETE",
    });
    expect(dbMock.scrutin.count).not.toHaveBeenCalled();
  });

  it("ne publie pas de taux quand deux mandats se chevauchent dans la législature", async () => {
    dbMock.mandate.findMany.mockResolvedValue([
      deputyMandate("a", "2022-06-22", "2024-06-09"),
      deputyMandate("b", "2023-01-01", "2024-06-09"),
    ]);

    const result = await getPoliticianLegislatureVotes("depute", 16);

    expect(result.perimeter.issue).toBe("OVERLAPPING_MANDATES");
    expect(result.stats.participationRate).toBeNull();
    expect(result.stats.participationStatus).toBe("COMPUTATION_INCOMPLETE");
  });

  it("ne publie pas de taux quand des votes tombent hors des dates de mandat", async () => {
    dbMock.vote.count.mockResolvedValue(3);

    const result = await getPoliticianLegislatureVotes("depute", 16);

    expect(result.perimeter).toEqual({ issue: "VOTES_OUTSIDE_MANDATE", periods: [] });
    expect(result.stats.participationRate).toBeNull();
    expect(result.stats.eligibleScrutins).toBeNull();
    expect(result.stats.total).toBe(10);
  });

  it("ne publie pas de taux quand aucun scrutin n'a eu lieu pendant la période documentée", async () => {
    dbMock.scrutin.count.mockResolvedValue(0);

    const result = await getPoliticianLegislatureVotes("depute", 16);

    expect(result.perimeter.issue).toBe("NO_MANDATE");
    expect(result.stats.participationRate).toBeNull();
  });

  it("ignore un mandat de député d'une autre législature", async () => {
    dbMock.mandate.findMany.mockResolvedValue([deputyMandate("m17", "2026-04-17", null, true)]);

    const result = await getPoliticianLegislatureVotes("depute", 16);

    expect(result.perimeter.issue).toBe("NO_MANDATE");
  });

  it("n'invente pas de périmètre pour une législature absente de la base", async () => {
    const result = await getPoliticianLegislatureVotes("depute", 15);

    expect(result.perimeter.issue).toBe("NO_MANDATE");
    expect(result.stats.participationRate).toBeNull();
  });
});

describe("getPoliticianAnLegislatures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.scrutin.groupBy.mockResolvedValue([
      { legislature: 16, _min: { votingDate: L16_START }, _max: { votingDate: L16_END } },
      {
        legislature: 17,
        _min: { votingDate: new Date("2024-10-08T00:00:00.000Z") },
        _max: { votingDate: new Date("2026-10-16T00:00:00.000Z") },
      },
    ]);
  });

  it("ne propose que les législatures où le député a des votes, la plus récente d'abord", async () => {
    dbMock.vote.count.mockImplementation(
      async ({ where }: { where: { scrutin: { legislature: number } } }) =>
        where.scrutin.legislature === 16 ? 120 : 0
    );

    expect(await getPoliticianAnLegislatures("depute")).toEqual([
      { legislature: 16, totalVotes: 120 },
    ]);
  });

  it("classe les législatures de la plus récente à la plus ancienne", async () => {
    dbMock.vote.count.mockResolvedValue(5);

    const options = await getPoliticianAnLegislatures("depute");

    expect(options.map((o) => o.legislature)).toEqual([17, 16]);
  });
});

describe("getAnLegislatureWindows", () => {
  it("n'interroge que l'Assemblée nationale (le Sénat numérote par année)", async () => {
    dbMock.scrutin.groupBy.mockResolvedValue([]);

    await getAnLegislatureWindows();

    expect(dbMock.scrutin.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { chamber: "AN" } })
    );
  });
});
