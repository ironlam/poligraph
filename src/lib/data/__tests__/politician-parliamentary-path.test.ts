import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMandates: vi.fn(),
  getOptions: vi.fn(),
  getVotes: vi.fn(),
}));

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { mandate: { findMany: (...args: unknown[]) => mocks.findMandates(...args) } },
}));
vi.mock("@/services/politician-legislature-votes", () => ({
  getPoliticianAnLegislatures: (...args: unknown[]) => mocks.getOptions(...args),
  getPoliticianLegislatureVotes: (...args: unknown[]) => mocks.getVotes(...args),
}));

import { getPoliticianParliamentaryPath } from "../politician-parliamentary-path";

const mandate = (id: string, startDate: string, endDate: string | null, isCurrent = false) => ({
  id,
  politicianId: "depute",
  type: "DEPUTE",
  startDate: new Date(startDate),
  endDate: endDate ? new Date(endDate) : null,
  isCurrent,
  constituency: "Essonne (1ère)",
  source: null,
  lastConfirmedAt: null,
});

describe("getPoliticianParliamentaryPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMandates.mockResolvedValue([]);
    mocks.getOptions.mockResolvedValue([]);
  });

  it("ne lit que les mandats de député de la personne", async () => {
    await getPoliticianParliamentaryPath("depute");

    expect(mocks.findMandates).toHaveBeenCalledWith(
      expect.objectContaining({ where: { politicianId: "depute", type: "DEPUTE" } })
    );
  });

  it("assemble mandats, votes par législature et couverture de la configuration", async () => {
    mocks.findMandates.mockResolvedValue([
      mandate("m16", "2022-06-22", "2024-06-09"),
      mandate("m17", "2024-07-01", null, true),
    ]);
    mocks.getOptions.mockResolvedValue([
      { legislature: 17, totalVotes: 9000 },
      { legislature: 16, totalVotes: 4000 },
    ]);
    mocks.getVotes.mockImplementation(async (_id: string, legislature: number) => ({
      legislature,
      counts: { total: legislature === 17 ? 9000 : 4000, amendments: 0, nonAmendments: 0 },
      perimeter: { issue: null, periods: [] },
    }));

    const rows = await getPoliticianParliamentaryPath("depute");

    expect(mocks.getVotes).toHaveBeenCalledWith("depute", 16);
    expect(mocks.getVotes).toHaveBeenCalledWith("depute", 17);
    expect(rows.map((r) => [r.legislature, r.votes?.total, r.datesStatus.reason])).toEqual([
      [17, 9000, "CONSISTENT"],
      [16, 4000, "CONSISTENT"],
    ]);
    expect(rows[0]!.period).toBe("depuis 2024");
    expect(rows[1]!.period).toBe("2022-2024");
  });

  it("marque la 15e comme sans votes importés d'après la configuration", async () => {
    mocks.findMandates.mockResolvedValue([mandate("m15", "2017-06-21", "2022-06-21")]);

    const rows = await getPoliticianParliamentaryPath("depute");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ legislature: 15, votes: null, votesImported: false });
    expect(mocks.getVotes).not.toHaveBeenCalled();
  });

  it("renvoie un parcours vide pour une personne sans mandat de député ni vote", async () => {
    expect(await getPoliticianParliamentaryPath("maire")).toEqual([]);
  });
});
