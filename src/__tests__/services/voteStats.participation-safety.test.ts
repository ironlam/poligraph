import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  mandate: { findFirst: vi.fn() },
  vote: { groupBy: vi.fn(), count: vi.fn() },
  scrutin: { aggregate: vi.fn() },
  parliamentaryGroupStats: { findMany: vi.fn() },
  politicianParticipation: {
    aggregate: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    findUnique: vi.fn(),
  },
  statsSnapshot: { findUnique: vi.fn() },
  $queryRaw: vi.fn(),
}));

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import { getPoliticianVotingStats, voteStatsService } from "@/services/voteStats";

function currentMandate(type: "DEPUTE" | "SENATEUR", startDate = new Date("2024-07-08")) {
  return { type, startDate, endDate: null, isCurrent: true };
}

describe("publication de la participation individuelle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.vote.groupBy.mockResolvedValue([]);
  });

  it("fail closed pour un scrutin Sénat contenant p, c, a et n", async () => {
    dbMock.mandate.findFirst.mockResolvedValue(currentMandate("SENATEUR"));
    dbMock.vote.groupBy.mockResolvedValue([
      { position: "POUR", _count: 1 },
      { position: "CONTRE", _count: 1 },
      { position: "ABSTENTION", _count: 1 },
      { position: "NON_VOTANT", _count: 1 },
    ]);

    const result = await getPoliticianVotingStats("senateur-courant", "SENATEUR");

    expect(result).toMatchObject({
      total: 4,
      nonVotant: 1,
      eligibleScrutins: null,
      scrutinsSansVoteEnregistre: null,
      participationRate: null,
      participationStatus: "SOURCE_INSUFFICIENT",
    });
    expect(dbMock.$queryRaw).not.toHaveBeenCalled();
  });

  it("ne transforme pas la période gouvernementale de Nathalie Delattre en absence", async () => {
    dbMock.mandate.findFirst.mockResolvedValue(null);
    dbMock.vote.groupBy.mockResolvedValue([{ position: "POUR", _count: 18 }]);

    const result = await getPoliticianVotingStats("nathalie-delattre", "SENATEUR");

    expect(result.scrutinsSansVoteEnregistre).toBeNull();
    expect(result.participationRate).toBeNull();
    expect(result.participationStatus).toBe("SOURCE_INSUFFICIENT");
  });

  it("borne l'AN au mandat courant et exclut NON_VOTANT du numérateur", async () => {
    const startDate = new Date("2024-10-22");
    dbMock.mandate.findFirst.mockResolvedValue(currentMandate("DEPUTE", startDate));
    dbMock.vote.groupBy.mockResolvedValue([
      { position: "POUR", _count: 2 },
      { position: "NON_VOTANT", _count: 1 },
    ]);
    dbMock.$queryRaw.mockResolvedValue([{ count: 4 }]);

    const result = await getPoliticianVotingStats("depute-entrant", "DEPUTE");

    expect(result).toMatchObject({
      total: 3,
      nonVotant: 1,
      eligibleScrutins: 4,
      scrutinsSansVoteEnregistre: 1,
      participationRate: 50,
      participationStatus: "AVAILABLE",
    });
  });

  it("fail closed pour un député courant sans scrutin éligible", async () => {
    dbMock.mandate.findFirst.mockResolvedValue(currentMandate("DEPUTE"));
    dbMock.$queryRaw.mockResolvedValue([{ count: 0 }]);

    const result = await getPoliticianVotingStats("depute-zero", "DEPUTE");

    expect(result).toMatchObject({
      eligibleScrutins: 0,
      scrutinsSansVoteEnregistre: null,
      participationRate: null,
      participationStatus: "COMPUTATION_INCOMPLETE",
    });
  });

  it("distingue un vrai taux AN de 0 d'un calcul incomplet", async () => {
    dbMock.mandate.findFirst.mockResolvedValue(currentMandate("DEPUTE"));
    dbMock.$queryRaw.mockResolvedValue([{ count: 3 }]);

    const result = await getPoliticianVotingStats("depute-sans-vote", "DEPUTE");

    expect(result).toMatchObject({
      eligibleScrutins: 3,
      scrutinsSansVoteEnregistre: 3,
      participationRate: 0,
      participationStatus: "AVAILABLE",
    });
  });

  it.each([
    ["Véronique Guillotin", "SENATEUR", "SOURCE_INSUFFICIENT"],
    ["Jean-Marc Delia", "SENATEUR", "SOURCE_INSUFFICIENT"],
    ["François-Noël Buffet", "SENATEUR", "SOURCE_INSUFFICIENT"],
    ["Christophe Barthès", "DEPUTE", "COMPUTATION_INCOMPLETE"],
  ] as const)("ne publie aucun fallback pour l'ancien mandat de %s", async (_, type, status) => {
    dbMock.mandate.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ type });
    dbMock.vote.groupBy.mockResolvedValue([{ position: "POUR", _count: 100 }]);

    const result = await getPoliticianVotingStats(`ancien-${type.toLowerCase()}`);

    expect(result.participationRate).toBeNull();
    expect(result.participationStatus).toBe(status);
    expect(dbMock.vote.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ chamber: type === "DEPUTE" ? "AN" : "SENAT" }),
      })
    );
  });

  it.each([
    [undefined, "COMPUTATION_INCOMPLETE"],
    ["DEPUTE", "COMPUTATION_INCOMPLETE"],
    ["SENATEUR", "SOURCE_INSUFFICIENT"],
  ] as const)(
    "fail closed sans mandat courant avec mandateType=%s",
    async (mandateType, status) => {
      dbMock.mandate.findFirst.mockResolvedValue(null);

      const result = await getPoliticianVotingStats("sans-mandat", mandateType);

      expect(result.participationRate).toBeNull();
      expect(result.participationStatus).toBe(status);
      if (mandateType === undefined) expect(dbMock.vote.groupBy).not.toHaveBeenCalled();
    }
  );
});

describe("agrégats et données persistées hostiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.scrutin.aggregate.mockResolvedValue({
      _count: 1,
      _sum: { votesFor: 10, votesAgainst: 4, votesAbstain: 2 },
    });
  });

  async function aggregateFor(chamber?: "AN" | "SENAT") {
    dbMock.$queryRaw
      .mockResolvedValueOnce([
        {
          partyId: "p1",
          partyName: "Parti test",
          partyShortName: "PT",
          partyColor: null,
          partySlug: "pt",
          position: "POUR",
          count: BigInt(120),
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ an: 1, senat: 1, adoptes: 1, rejetes: 0 }]);
    return voteStatsService.getVoteStats(chamber);
  }

  it.each([
    [undefined, "COMPUTATION_INCOMPLETE"],
    ["AN", "COMPUTATION_INCOMPLETE"],
    ["SENAT", "SOURCE_INSUFFICIENT"],
  ] as const)("ne publie aucun agrégat avec chamber=%s", async (chamber, status) => {
    const result = await aggregateFor(chamber);

    expect(result.global).toMatchObject({
      participationRate: null,
      participationStatus: status,
    });
    expect(result.parties[0]).toMatchObject({
      participationRate: null,
      participationStatus: status,
    });
    expect(dbMock.politicianParticipation.aggregate).not.toHaveBeenCalled();
  });

  it("ignore les classements et snapshots historiques, y compris les anciennes lignes Sénat", async () => {
    await expect(voteStatsService.getParticipationRanking()).resolves.toEqual({
      entries: [],
      total: 0,
    });
    await expect(voteStatsService.getPartyParticipationStats("AN")).resolves.toEqual([]);
    await expect(voteStatsService.getGroupParticipationStats("SENAT")).resolves.toEqual([]);

    expect(dbMock.politicianParticipation.findMany).not.toHaveBeenCalled();
    expect(dbMock.statsSnapshot.findUnique).not.toHaveBeenCalled();
  });

  it("conserve le classement de dissidence sans lire PoliticianParticipation", async () => {
    dbMock.$queryRaw.mockResolvedValue([
      { politicianId: "senateur-dissident", totalRows: 12 },
      { politicianId: "senateur-2", totalRows: 12 },
    ]);

    const result = await voteStatsService.getPoliticianDissidenceRanking("SENAT", 1, 2);

    expect(result).toEqual({
      politicianIds: ["senateur-dissident", "senateur-2"],
      total: 12,
    });
    expect(dbMock.politicianParticipation.findMany).not.toHaveBeenCalled();
  });

  it.each(["AN", "SENAT"] as const)(
    "neutralise averageParticipationPct pour %s même si la ligne vaut 100",
    async (chamber) => {
      dbMock.parliamentaryGroupStats.findMany.mockResolvedValue([
        {
          groupId: "senat-lr",
          cohesionPct: 88,
          governmentAlignmentPct: 42,
          averageParticipationPct: 100,
          group: {
            code: "LR",
            name: "Les Républicains",
            color: null,
            slug: "lr-senat",
            chamber,
          },
        },
      ]);

      const result = await voteStatsService.getGroupDynamicsStats(chamber);

      expect(result[0]?.averageParticipationPct).toBeNull();
      expect(result[0]?.cohesionPct).toBe(88);
    }
  );
});
