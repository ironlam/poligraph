import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  mandate: { findMany: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));

import { computePoliticianParticipation } from "../compute-stats";

function rawRow(politicianId: string, votesCount = 1, eligibleScrutins = 2) {
  return {
    politicianId,
    firstName: "Test",
    lastName: politicianId,
    slug: politicianId,
    photoUrl: null,
    partyId: null,
    partyShortName: null,
    partyColor: null,
    partySlug: null,
    groupId: null,
    groupCode: null,
    groupName: null,
    groupColor: null,
    mandateType: "DEPUTE",
    chamber: "AN",
    votesCount,
    eligibleScrutins,
  };
}

function mandate(politicianId: string, type: "DEPUTE" | "SENATEUR") {
  return {
    politicianId,
    type,
    startDate: new Date("2024-07-08"),
    endDate: null,
  };
}

describe("producteur persistant de participation", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["un DEPUTE", ["DEPUTE"], true],
    ["un SENATEUR", ["SENATEUR"], false],
    ["aucun mandat", [], false],
    ["DEPUTE + SENATEUR", ["DEPUTE", "SENATEUR"], false],
    ["deux DEPUTE", ["DEPUTE", "DEPUTE"], false],
    ["deux SENATEUR", ["SENATEUR", "SENATEUR"], false],
    ["plus de deux mandats", ["DEPUTE", "SENATEUR", "DEPUTE"], false],
  ] as const)("%s: ligne publiable=%s", async (_, types, expected) => {
    const politicianId = "politician-matrix";
    dbMock.$queryRaw.mockResolvedValue([rawRow(politicianId)]);
    dbMock.mandate.findMany.mockResolvedValue(types.map((type) => mandate(politicianId, type)));

    const result = await computePoliticianParticipation();

    expect(result).toHaveLength(expected ? 1 : 0);
  });

  it("applique exactement l'arrondi entier temps réel à chaque ligne persistée", async () => {
    const cases = [
      ["zero", 0, 10, 0],
      ["observed-266", 2244, 8434, 27],
      ["observed-92", 493, 5380, 9],
      ["observed-209", 1762, 8434, 21],
      ["below-half", 1049, 10000, 10],
      ["at-half", 1050, 10000, 11],
      ["full", 10, 10, 100],
    ] as const;
    dbMock.$queryRaw.mockResolvedValue(
      cases.map(([id, expressed, eligible]) => rawRow(id, expressed, eligible))
    );
    dbMock.mandate.findMany.mockResolvedValue(cases.map(([id]) => mandate(id, "DEPUTE")));

    const result = await computePoliticianParticipation();

    expect(
      result.map(({ politicianId, participationRate, computationVersion }) => [
        politicianId,
        participationRate,
        computationVersion,
      ])
    ).toEqual(cases.map(([id, , , expected]) => [id, expected, "public-scrutins-v2"]));
  });
});
