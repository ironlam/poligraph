import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  mandate: { findFirst: vi.fn() },
  vote: { groupBy: vi.fn(), count: vi.fn() },
  politicianParticipation: {
    aggregate: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    findUnique: vi.fn(),
  },
  $queryRaw: vi.fn(),
}));

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import { getPoliticianVotingStats, voteStatsService } from "@/services/voteStats";

describe("publication de la participation parlementaire", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fail closed pour un scrutin Sénat contenant p, c, a et n", async () => {
    dbMock.mandate.findFirst.mockResolvedValue({
      type: "SENATEUR",
      startDate: new Date("2020-10-01"),
      endDate: null,
    });
    dbMock.vote.groupBy.mockResolvedValue([
      { position: "POUR", _count: 1 },
      { position: "CONTRE", _count: 1 },
      { position: "ABSTENTION", _count: 1 },
      { position: "NON_VOTANT", _count: 1 },
    ]);

    const result = await getPoliticianVotingStats("senateur-1", "SENATEUR");

    expect(result).toMatchObject({
      total: 4,
      nonVotant: 1,
      absent: 0,
      participationRate: null,
      participationStatus: "SOURCE_INSUFFICIENT",
    });
    expect(dbMock.$queryRaw).not.toHaveBeenCalled();
  });

  it("ne transforme pas la période gouvernementale de Nathalie Delattre en absence", async () => {
    dbMock.mandate.findFirst.mockResolvedValue({
      type: "SENATEUR",
      startDate: new Date("2020-10-01"),
      endDate: null,
    });
    dbMock.vote.groupBy.mockResolvedValue([{ position: "POUR", _count: 18 }]);

    const result = await getPoliticianVotingStats("nathalie-delattre", "SENATEUR");

    expect(result.absent).toBe(0);
    expect(result.participationRate).toBeNull();
  });

  it("borne le dénominateur AN à la période du mandat et exclut NON_VOTANT du numérateur", async () => {
    const startDate = new Date("2024-10-22");
    dbMock.mandate.findFirst.mockResolvedValue({ type: "DEPUTE", startDate, endDate: null });
    dbMock.vote.groupBy.mockResolvedValue([
      { position: "POUR", _count: 2 },
      { position: "NON_VOTANT", _count: 1 },
    ]);
    dbMock.$queryRaw.mockResolvedValue([{ count: 4 }]);

    const result = await getPoliticianVotingStats("depute-entrant", "DEPUTE");

    expect(result).toMatchObject({
      total: 3,
      nonVotant: 1,
      absent: 1,
      participationRate: 50,
      participationStatus: "AVAILABLE",
    });
    expect(dbMock.$queryRaw).toHaveBeenCalledOnce();
  });

  it("ignore les anciennes lignes SENAT dans classements et cartes numériques", async () => {
    const ranking = await voteStatsService.getParticipationRanking("SENAT");
    expect(ranking).toEqual({ entries: [], total: 0 });
    expect(dbMock.politicianParticipation.findMany).not.toHaveBeenCalled();

    dbMock.vote.count.mockResolvedValue(18);
    dbMock.$queryRaw.mockResolvedValue([{ count: 2, total: 48, rate: 4.2 }]);
    const card = await voteStatsService.getPoliticianParliamentaryCard(
      "nathalie-delattre",
      "SENATEUR"
    );

    expect(card).toMatchObject({
      participationRate: null,
      eligibleScrutins: null,
      participationStatus: "SOURCE_INSUFFICIENT",
      dissidenceRate: 4.2,
    });
    expect(dbMock.politicianParticipation.count).not.toHaveBeenCalled();
    expect(dbMock.politicianParticipation.findUnique).not.toHaveBeenCalled();
  });

  it("force les classements génériques à utiliser uniquement les lignes AN", async () => {
    dbMock.politicianParticipation.findMany.mockResolvedValue([]);
    dbMock.politicianParticipation.count.mockResolvedValue(0);

    await voteStatsService.getParticipationRanking();

    expect(dbMock.politicianParticipation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { chamber: "AN" } })
    );
  });
});
