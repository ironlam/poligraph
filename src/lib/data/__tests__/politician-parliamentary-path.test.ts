import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMandates: vi.fn(),
  getOptions: vi.fn(),
  getVotes: vi.fn(),
  findPoliticians: vi.fn(),
}));

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    mandate: { findMany: (...args: unknown[]) => mocks.findMandates(...args) },
    politician: { findMany: (...args: unknown[]) => mocks.findPoliticians(...args) },
  },
}));
vi.mock("@/services/politician-legislature-votes", () => ({
  getPoliticianAnLegislatures: (...args: unknown[]) => mocks.getOptions(...args),
  getPoliticianLegislatureVotes: (...args: unknown[]) => mocks.getVotes(...args),
}));

import {
  getPoliticianIdsWithAnVotes,
  getPoliticianParliamentaryPath,
  loadParliamentaryPath,
} from "../politician-parliamentary-path";

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

describe("loadParliamentaryPath", () => {
  const LOCAL_ONLY = [{ type: "MAIRE_ARRONDISSEMENT" }];

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMandates.mockResolvedValue([]);
    mocks.getOptions.mockResolvedValue([]);
    mocks.findPoliticians.mockResolvedValue([]);
  });

  it("affiche la 16e d'une personne sans mandat de député mais avec des votes (cas Rudigoz)", async () => {
    // Seul mandat en base : maire d'arrondissement. 270 votes sur les textes, 796 sur les
    // amendements, tous en 16e législature.
    mocks.findPoliticians.mockResolvedValue([{ id: "rudigoz" }, { id: "autre-depute" }]);
    mocks.getOptions.mockResolvedValue([{ legislature: 16, totalVotes: 1066 }]);
    mocks.getVotes.mockResolvedValue({
      legislature: 16,
      counts: { total: 1066, amendments: 796, nonAmendments: 270 },
      perimeter: { issue: "NO_MANDATE", periods: [] },
    });

    const rows = await loadParliamentaryPath({ politicianId: "rudigoz", mandates: LOCAL_ONLY });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      legislature: 16,
      mandates: [],
      votes: { total: 1066 },
      datesStatus: { kind: "unverified", reason: "NO_MANDATE" },
    });
    expect(mocks.getVotes).toHaveBeenCalledWith("rudigoz", 16);
  });

  it("n'infère aucun mandat à partir des votes", async () => {
    mocks.findPoliticians.mockResolvedValue([{ id: "rudigoz" }]);
    mocks.getOptions.mockResolvedValue([{ legislature: 16, totalVotes: 1066 }]);
    mocks.getVotes.mockResolvedValue({
      legislature: 16,
      counts: { total: 1066, amendments: 796, nonAmendments: 270 },
      perimeter: { issue: "NO_MANDATE", periods: [] },
    });

    const [row] = await loadParliamentaryPath({ politicianId: "rudigoz", mandates: LOCAL_ONLY });

    expect(row!.mandates).toEqual([]);
    expect(row!.datesStatus.kind).not.toBe("complete");
  });

  it("ne lit pas l'ensemble des votants quand un mandat de député est déjà connu", async () => {
    mocks.findMandates.mockResolvedValue([mandate("m17", "2024-07-01", null, true)]);

    await loadParliamentaryPath({ politicianId: "depute", mandates: [{ type: "DEPUTE" }] });

    expect(mocks.findPoliticians).not.toHaveBeenCalled();
    expect(mocks.findMandates).toHaveBeenCalled();
  });

  it("ne coûte aucune lecture par personne à une fiche sans trace parlementaire", async () => {
    mocks.findPoliticians.mockResolvedValue([{ id: "rudigoz" }]);

    const rows = await loadParliamentaryPath({
      politicianId: "maire-sans-votes",
      mandates: LOCAL_ONLY,
    });

    expect(rows).toEqual([]);
    expect(mocks.findMandates).not.toHaveBeenCalled();
    expect(mocks.getOptions).not.toHaveBeenCalled();
    expect(mocks.getVotes).not.toHaveBeenCalled();
  });
});

describe("getPoliticianIdsWithAnVotes", () => {
  it("ne compte que les votes de l'Assemblée nationale, en une seule requête", async () => {
    vi.clearAllMocks();
    mocks.findPoliticians.mockResolvedValue([{ id: "a" }, { id: "b" }]);

    expect(await getPoliticianIdsWithAnVotes()).toEqual(["a", "b"]);
    expect(mocks.findPoliticians).toHaveBeenCalledTimes(1);
    expect(mocks.findPoliticians).toHaveBeenCalledWith({
      where: { votes: { some: { chamber: "AN" } } },
      select: { id: true },
    });
  });
});
