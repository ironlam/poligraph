import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  communeFindUnique: vi.fn(),
  communeFindMany: vi.fn(),
  communeGroupBy: vi.fn(),
  mandateFindMany: vi.fn(),
  mandateFindFirst: vi.fn(),
  mandateCount: vi.fn(),
  mandateGroupBy: vi.fn(),
  candidacyFindMany: vi.fn(),
  candidacyCount: vi.fn(),
  roundFindMany: vi.fn(),
  electionFindUnique: vi.fn(),
  syncFindUnique: vi.fn(),
  decisionCount: vi.fn(async () => 0),
  conseilFindMany: vi.fn(async (_args: { where: Record<string, unknown> }) => [] as unknown[]),
  queryRaw: vi.fn(),
  populationEnVigueur: vi.fn(),
  departementVintages: vi.fn(),
  readIntercommunalites: vi.fn(),
  readPresidentielles: vi.fn(async () => ({ blocks: [] as unknown[], agregatTerritoire: null })),
}));

vi.mock("server-only", () => ({}));
vi.mock("../territoires-intercommunalites", () => ({
  readIntercommunalites: (code: string) => mocks.readIntercommunalites(code),
}));
vi.mock("../territoires-presidentielle", () => ({
  readCommunePresidentielles: mocks.readPresidentielles,
}));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("../commune-population", () => ({
  readPopulationEnVigueur: mocks.populationEnVigueur,
  readDepartementPopulationVintages: mocks.departementVintages,
}));
vi.mock("@/lib/db", () => ({
  db: {
    commune: {
      findUnique: mocks.communeFindUnique,
      findMany: mocks.communeFindMany,
      groupBy: mocks.communeGroupBy,
    },
    mandate: {
      findMany: mocks.mandateFindMany,
      findFirst: mocks.mandateFindFirst,
      count: mocks.mandateCount,
      groupBy: mocks.mandateGroupBy,
    },
    candidacy: { findMany: mocks.candidacyFindMany, count: mocks.candidacyCount },
    communeElectionRound: { findMany: mocks.roundFindMany },
    election: { findUnique: mocks.electionFindUnique },
    syncMetadata: { findUnique: mocks.syncFindUnique },
    decision: { count: mocks.decisionCount },
    conseilMembre: { findMany: mocks.conseilFindMany },
    $queryRaw: mocks.queryRaw,
  },
}));

import { PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";
import {
  getCommuneDossier,
  getDepartementTerritoire,
  getRegionTerritoire,
  matchDepartements,
  matchRegions,
  parseConstituencyNumber,
  resolvePremierTour,
  resolveTitulaire,
  searchTerritoires,
} from "../territoires";

type Status = "PUBLISHED" | "DRAFT";

function person(slug: string, status: Status = "PUBLISHED") {
  return {
    slug,
    fullName: `Nom ${slug}`,
    lastName: slug,
    photoUrl: null,
    blobPhotoUrl: null,
    publicationStatus: status,
  };
}

interface FakeMandate {
  id: string;
  type: string;
  departmentCode?: string;
  constituency?: string | null;
  status?: Status;
}

/** Mandates fake: honours the type and the public boundary on the politician relation. */
function serveMandates(rows: FakeMandate[]) {
  mocks.mandateFindMany.mockImplementation(
    async (args: { where: { type?: string; politician?: { publicationStatus?: string } } }) =>
      rows
        .filter((r) => r.type === args.where.type)
        .filter(
          (r) =>
            !args.where.politician?.publicationStatus ||
            (r.status ?? "PUBLISHED") === args.where.politician.publicationStatus
        )
        .map((r) => ({
          id: r.id,
          title: null,
          constituency: r.constituency ?? null,
          lastConfirmedAt: null,
          source: "RNE",
          localData: { functionStart: null, sectorLabel: null, communeId: "35238" },
          politician: person(r.id, r.status),
        }))
  );
  mocks.mandateFindFirst.mockImplementation(async (args: { where: { id: string } }) => {
    const row = rows.find(
      (r) => r.id === args.where.id && (r.status ?? "PUBLISHED") === "PUBLISHED"
    );
    return row
      ? {
          startDate: new Date("2026-03-22T00:00:00Z"),
          lastConfirmedAt: null,
          source: "RNE",
          localData: { functionStart: new Date("2026-03-22T00:00:00Z") },
          politician: person(row.id),
        }
      : null;
  });
}

const RENNES = {
  id: "35238",
  name: "Rennes",
  departmentCode: "35",
  postalCodes: ["35000"],
  population: 230890,
  constituencyNumber: 1,
  latitude: 48.1159,
  longitude: -1.6884,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.communeFindUnique.mockResolvedValue(RENNES);
  mocks.syncFindUnique.mockResolvedValue({ lastSyncAt: new Date("2026-08-10T09:00:00Z") });
  mocks.electionFindUnique.mockResolvedValue({
    id: "m2026",
    round1Date: new Date("2026-03-15T00:00:00Z"),
    round2Date: new Date("2026-03-22T00:00:00Z"),
  });
  mocks.candidacyFindMany.mockResolvedValue([]);
  mocks.candidacyCount.mockResolvedValue(0);
  mocks.roundFindMany.mockResolvedValue([]);
  mocks.populationEnVigueur.mockResolvedValue(null);
  mocks.departementVintages.mockResolvedValue([]);
  mocks.conseilFindMany.mockResolvedValue([]);
  mocks.readIntercommunalites.mockResolvedValue(null);
  serveMandates([]);
});

describe("fonctions pures", () => {
  it("applique l'article L. 262 : majorité absolue et quart des inscrits", () => {
    const base = { round2Pct: null, importIsElected: false };
    expect(
      resolvePremierTour({ ...base, round1Pct: 60, round1Votes: 250, registeredVoters: 1000 })
    ).toBe("ELUE");
    expect(
      resolvePremierTour({ ...base, round1Pct: 60, round1Votes: 249, registeredVoters: 1000 })
    ).toBe("NON_ELUE");
    expect(
      resolvePremierTour({ ...base, round1Pct: 50, round1Votes: 900, registeredVoters: 1000 })
    ).toBe("NON_ELUE");
    // Inscrits inconnus : seul l'import peut l'affirmer, sinon rien n'est établi.
    expect(
      resolvePremierTour({ ...base, round1Pct: 60, round1Votes: 600, registeredVoters: null })
    ).toBe("NON_ETABLI");
    expect(
      resolvePremierTour({
        round1Pct: 60,
        round1Votes: 600,
        registeredVoters: null,
        round2Pct: null,
        importIsElected: true,
      })
    ).toBe("ELUE");
    // Une liste présente au second tour n'a pas été élue au premier.
    expect(
      resolvePremierTour({
        round1Pct: 55,
        round1Votes: 600,
        registeredVoters: null,
        round2Pct: 58,
        importIsElected: true,
      })
    ).toBe("NON_ELUE");
  });

  it("lit le numéro de circonscription d'un libellé de mandat", () => {
    expect(parseConstituencyNumber("Vendée (3)")).toBe(3);
    expect(parseConstituencyNumber("Rhône (13)")).toBe(13);
    expect(parseConstituencyNumber("Martinique")).toBeNull();
    expect(parseConstituencyNumber(null)).toBeNull();
  });

  it("n'établit un titulaire que s'il est unique et public", () => {
    expect(resolveTitulaire([]).state).toBe("ABSENT");
    expect(resolveTitulaire([{ publicationStatus: "PUBLISHED" }]).state).toBe("ETABLI");
    expect(resolveTitulaire([{ publicationStatus: "DRAFT" }])).toEqual({
      state: "NON_ETABLI",
      holder: null,
    });
    expect(
      resolveTitulaire([{ publicationStatus: "PUBLISHED" }, { publicationStatus: "PUBLISHED" }])
        .holder
    ).toBeNull();
  });

  it("trouve départements et régions par nom, accents et code", () => {
    expect(matchDepartements("loire")[0]?.name).toBe("Loire");
    expect(matchDepartements("2a")[0]?.name).toBe("Corse-du-Sud");
    expect(matchDepartements("finistere")[0]?.code).toBe("29");
    expect(matchRegions("ile de france")[0]?.code).toBe("11");
    expect(matchRegions("x").length).toBe(0);
  });
});

describe("getCommuneDossier", () => {
  it("n'annonce aucune intercommunalité avant le premier import", async () => {
    const dossier = await getCommuneDossier("35238");
    expect(mocks.readIntercommunalites).toHaveBeenCalledWith("35238");
    expect(dossier?.intercommunalite).toBeNull();
    expect(dossier?.coverage.some((c) => c.bloc === "intercommunalite")).toBe(false);
  });

  it("porte l'intercommunalité et son état dans la matrice de couverture", async () => {
    const source = { label: "INSEE, EPCI à fiscalité propre au 1er janvier 2026", url: null };
    const block = {
      state: "AUCUNE" as const,
      intercommunalites: [],
      situationDate: "2026-01-01T00:00:00.000Z",
      source,
      lastCheckedAt: null,
    };
    mocks.readIntercommunalites.mockResolvedValue(block);
    const aucune = await getCommuneDossier("35238");
    expect(aucune?.intercommunalite).toEqual(block);
    // "Sans objet" is an established fact, not a missing one.
    expect(aucune?.coverage.find((c) => c.bloc === "intercommunalite")).toEqual({
      bloc: "intercommunalite",
      state: "DISPONIBLE",
      source,
      date: "2026-01-01T00:00:00.000Z",
    });

    mocks.readIntercommunalites.mockResolvedValue({
      ...block,
      state: "NON_ETABLI",
      situationDate: null,
    });
    const nonEtabli = await getCommuneDossier("35238");
    expect(nonEtabli?.coverage.find((c) => c.bloc === "intercommunalite")?.state).toBe(
      "NON_ETABLI"
    );
  });

  it("refuse un code mal formé sans interroger la base", async () => {
    expect(await getCommuneDossier("../etc")).toBeNull();
    expect(await getCommuneDossier("123")).toBeNull();
    expect(mocks.communeFindUnique).not.toHaveBeenCalled();
  });

  it("compte les seules décisions publiées de la commune, dans la même lecture", async () => {
    serveMandates([{ id: "maire", type: "MAIRE" }]);
    mocks.decisionCount.mockResolvedValueOnce(3);

    const dossier = await getCommuneDossier("35238");

    expect(dossier?.decisionsPubliees).toBe(3);
    expect(mocks.decisionCount).toHaveBeenCalledWith({
      where: { communeId: "35238", status: "PUBLISHED" },
    });
  });

  it("établit le maire unique public, avec source et date de prise de fonction", async () => {
    serveMandates([
      { id: "maire", type: "MAIRE" },
      { id: "dep1", type: "DEPUTE", constituency: "Ille-et-Vilaine (1)" },
      { id: "dep2", type: "DEPUTE", constituency: "Ille-et-Vilaine (2)" },
      { id: "sen", type: "SENATEUR" },
    ]);

    const dossier = await getCommuneDossier("35238");

    expect(dossier?.maire.state).toBe("ETABLI");
    expect(dossier?.maire.person?.slug).toBe("maire");
    expect(dossier?.maire.functionStart).toBe("2026-03-22T00:00:00.000Z");
    expect(dossier?.maire.source?.label).toBe("Répertoire National des Élus");
    // 230 890 habitants : le député de la circonscription enregistrée est nommé avec réserve,
    // jamais présenté comme établi.
    expect(dossier?.parlement.deputes.state).toBe("NON_ETABLI");
    expect(dossier?.parlement.deputes.deputes).toEqual([]);
    expect(dossier?.parlement.deputes.deputesCirconscriptionEnregistree.map((d) => d.slug)).toEqual(
      ["dep1"]
    );
    expect(dossier?.parlement.deputes.reserve).toBe("CIRCONSCRIPTION_NON_VERIFIEE");
    expect(dossier?.coverage.find((c) => c.bloc === "deputes")).toMatchObject({
      state: "NON_ETABLI",
      reserve: "CIRCONSCRIPTION_NON_VERIFIEE",
    });
    expect(dossier?.parlement.senateurs.senateurs).toHaveLength(1);
    expect(dossier?.identity.region?.name).toBe("Bretagne");
    expect(dossier?.identity.coordinates).toEqual({ lat: 48.1159, lon: -1.6884 });
  });

  it("présente le député d'une commune de moins de 20 000 habitants, avec la réserve", async () => {
    mocks.communeFindUnique.mockResolvedValue({ ...RENNES, population: 19_999 });
    serveMandates([{ id: "dep1", type: "DEPUTE", constituency: "Ille-et-Vilaine (1)" }]);

    const deputes = (await getCommuneDossier("35238"))?.parlement.deputes;

    expect(deputes?.state).toBe("DISPONIBLE");
    expect(deputes?.deputes.map((d) => d.slug)).toEqual(["dep1"]);
    expect(deputes?.reserve).toBe("CIRCONSCRIPTION_NON_VERIFIEE");
  });

  it("ne présume rien d'une population inconnue pour le député", async () => {
    mocks.communeFindUnique.mockResolvedValue({ ...RENNES, population: null });
    serveMandates([{ id: "dep1", type: "DEPUTE", constituency: "Ille-et-Vilaine (1)" }]);
    expect((await getCommuneDossier("35238"))?.parlement.deputes.state).toBe("NON_ETABLI");
  });

  it("filtre les fiches publiques dans la requête des maires de secteur et des parlementaires", async () => {
    await getCommuneDossier("35238");

    const whereByType = new Map(
      mocks.mandateFindMany.mock.calls.map(([args]) => [args.where.type, args.where])
    );
    for (const type of ["MAIRE_ARRONDISSEMENT", "DEPUTE", "SENATEUR"]) {
      expect(whereByType.get(type)?.politician, type).toEqual(PUBLIC_POLITICIAN_WHERE);
      expect(whereByType.get(type)?.isCurrent, type).toBe(true);
    }
  });

  it("n'interroge que les listes publiées et lit le statut de publication des têtes de liste", async () => {
    await getCommuneDossier("35238");

    const args = mocks.candidacyFindMany.mock.calls[0]![0];
    expect(args.where).toMatchObject({
      communeId: "35238",
      listPosition: 1,
      OR: [{ electoralListId: null }, { electoralList: { publicationStatus: "PUBLISHED" } }],
    });
    expect(args.select.politician.select.publicationStatus).toBe(true);
  });

  it("ne nomme aucun maire quand deux sont courants, dont un non public", async () => {
    serveMandates([
      { id: "maire-public", type: "MAIRE" },
      { id: "maire-prive", type: "MAIRE", status: "DRAFT" },
    ]);

    const dossier = await getCommuneDossier("35238");

    expect(dossier?.maire.state).toBe("NON_ETABLI");
    expect(dossier?.maire.person).toBeNull();
    expect(JSON.stringify(dossier)).not.toContain("maire-public");
    expect(JSON.stringify(dossier)).not.toContain("maire-prive");
  });

  it("ne remplace jamais le conseil municipal ni le millésime de population", async () => {
    const dossier = await getCommuneDossier("35238");

    expect(dossier?.conseilMunicipal).toEqual({
      state: "NON_ETABLI",
      recordedCount: 0,
      membres: [],
      registerDate: null,
      source: null,
    });
    expect(dossier?.population.vintage).toBeNull();
    expect(dossier?.population.importedAt).toBe("2026-08-10T09:00:00.000Z");
    expect(dossier?.maire.state).toBe("ABSENT");
    expect(dossier?.coverage.find((c) => c.bloc === "conseilMunicipal")?.state).toBe("NON_ETABLI");
  });

  it("lit le conseil municipal du registre, maire puis adjoints par rang, sans lien de fiche", async () => {
    const row = (lastName: string, functionLabel: string | null) => ({
      lastName,
      firstName: "A",
      subdivisionLabel: null,
      functionLabel,
      registerDate: new Date("2026-08-11T12:00:00Z"),
    });
    mocks.conseilFindMany.mockResolvedValue([
      row("Zed", null),
      row("Trois", "3ème adjoint au Maire"),
      row("Maire", "Maire"),
      row("Un", "1er adjoint au Maire"),
    ]);

    const dossier = await getCommuneDossier("35238");

    expect(dossier?.conseilMunicipal.state).toBe("DISPONIBLE");
    expect(dossier?.conseilMunicipal.recordedCount).toBe(4);
    expect(dossier?.conseilMunicipal.membres.map((m) => m.lastName)).toEqual([
      "Maire",
      "Un",
      "Trois",
      "Zed",
    ]);
    expect(mocks.conseilFindMany.mock.calls[0]?.[0].where).toEqual({
      niveau: "MUNICIPAL",
      territoryCode: "35238",
    });
    expect(dossier?.coverage.find((c) => c.bloc === "conseilMunicipal")?.state).toBe("DISPONIBLE");
  });

  it("date la population par la série en vigueur, avec sa source et sa date de vérification", async () => {
    const vintage = {
      millesime: 2023,
      effectiveFrom: "2026-01-01",
      producer: "INSEE",
      sourceLabel: "INSEE, populations de référence 2023",
      sourceUrl: "https://www.insee.fr/fr/statistiques/8680726",
      importedAt: "2026-10-11T08:00:00.000Z",
    };
    mocks.populationEnVigueur.mockResolvedValue({
      value: 230000,
      vintage,
      verifiedAt: "2026-12-01T06:00:00.000Z",
    });

    const dossier = await getCommuneDossier("35238");

    expect(mocks.populationEnVigueur).toHaveBeenCalledWith("35238");
    expect(dossier?.population).toEqual({
      value: 230000,
      vintage,
      importedAt: "2026-12-01T06:00:00.000Z",
      source: { label: vintage.sourceLabel, url: vintage.sourceUrl },
    });
    expect(dossier?.coverage.find((c) => c.bloc === "population")).toMatchObject({
      state: "DISPONIBLE",
      source: { url: vintage.sourceUrl },
      date: "2026-12-01T06:00:00.000Z",
    });
  });

  it("ne désigne aucun député pour une commune PLM", async () => {
    mocks.communeFindUnique.mockResolvedValue({
      ...RENNES,
      id: "75056",
      name: "Paris",
      departmentCode: "75",
    });
    serveMandates([
      { id: "dep1", type: "DEPUTE", constituency: "Paris (1)", departmentCode: "75" },
    ]);

    const dossier = await getCommuneDossier("75056");

    expect(dossier?.parlement.deputes.state).toBe("NON_ETABLI");
    expect(dossier?.parlement.deputes.deputes).toEqual([]);
    expect(dossier?.parlement.deputes.couvertureCirconscriptions).toBe("PLUSIEURS");
    expect(dossier?.identity.collectivitesParticulieres.map((c) => c.id)).toContain(
      "ville-de-paris"
    );
  });

  it("présente une collectivité d'outre-mer sans région, avec son statut", async () => {
    mocks.communeFindUnique.mockResolvedValue({
      ...RENNES,
      id: "98735",
      name: "Papeete",
      departmentCode: "987",
      constituencyNumber: null,
      latitude: null,
      longitude: null,
    });

    const dossier = await getCommuneDossier("98735");

    expect(dossier?.identity.coordinates).toBeNull();
    expect(dossier?.identity.region).toBeNull();
    expect(dossier?.identity.territoireHorsRegion?.statut).toBe("Collectivité d'outre-mer");
  });

  it("déclare élue au premier tour la seule liste au-delà de 50 %, jamais à 50 %", async () => {
    mocks.roundFindMany.mockResolvedValue([
      {
        round: 1,
        registeredVoters: 1200,
        actualVoters: 950,
        validVotes: 900,
        participationRate: 79.17,
      },
    ]);
    mocks.candidacyFindMany.mockResolvedValue([
      {
        listName: "Liste A",
        candidateName: "A",
        round1Votes: 500,
        round1Pct: 50,
        round2Votes: null,
        round2Pct: null,
        isElected: true,
        politician: null,
      },
      {
        listName: "Liste B",
        candidateName: "B",
        round1Votes: 400,
        round1Pct: 50.01,
        round2Votes: null,
        round2Pct: null,
        isElected: false,
        politician: person("tete-privee", "DRAFT"),
      },
    ]);

    const block = (await getCommuneDossier("35238"))?.elections.municipales2026;

    expect(block?.state).toBe("DISPONIBLE");
    expect(block?.listes.map((l) => l.elueAuPremierTour)).toEqual([false, true]);
    expect(block?.listes.map((l) => l.electionAuPremierTour)).toEqual(["NON_ELUE", "ELUE"]);
    // Un candidat lié à une fiche non publique reste un nom de bulletin, sans lien.
    expect(block?.listes[1]?.teteDeListe).toEqual({ name: "B", person: null });
    expect(mocks.candidacyFindMany.mock.calls[0]![0].take).toBeLessThanOrEqual(50);
  });

  it("ne déclare pas élue au premier tour une liste majoritaire sous le quart des inscrits", async () => {
    // Forte abstention : 60 % des exprimés, mais 200 voix pour 1 000 inscrits.
    mocks.roundFindMany.mockResolvedValue([
      {
        round: 1,
        registeredVoters: 1000,
        actualVoters: 340,
        validVotes: 333,
        participationRate: 34,
      },
    ]);
    mocks.candidacyFindMany.mockResolvedValue([
      {
        listName: "Liste A",
        candidateName: "A",
        round1Votes: 200,
        round1Pct: 60,
        round2Votes: null,
        round2Pct: null,
        isElected: true,
        politician: null,
      },
    ]);

    const liste = (await getCommuneDossier("35238"))?.elections.municipales2026?.listes[0];

    expect(liste?.electionAuPremierTour).toBe("NON_ELUE");
    expect(liste?.elueAuPremierTour).toBe(false);
  });

  it("distingue l'absence de résultats d'une commune sans candidature", async () => {
    mocks.candidacyCount.mockResolvedValue(12);
    const block = (await getCommuneDossier("35238"))?.elections.municipales2026;
    expect(block?.state).toBe("NON_ETABLI");
  });
  it("porte la présidentielle de la commune et sa ligne de couverture", async () => {
    const absent = await getCommuneDossier("35238");
    expect(absent?.elections.presidentielles.blocks).toEqual([]);
    expect(absent?.coverage.find((c) => c.bloc === "presidentielle")?.state).toBe("ABSENT");

    mocks.readPresidentielles.mockResolvedValueOnce({
      blocks: [
        {
          electionSlug: "presidentielle-2022",
          sources: [{ round: 1, label: "Ministère", url: "https://x", publishedAt: "2022-04-14" }],
          importedAt: "2026-10-12T08:00:00.000Z",
        },
      ],
      agregatTerritoire: null,
    });
    const present = await getCommuneDossier("35238");
    expect(mocks.readPresidentielles).toHaveBeenLastCalledWith("35238", "35");
    expect(present?.coverage.find((c) => c.bloc === "presidentielle")).toEqual({
      bloc: "presidentielle",
      state: "DISPONIBLE",
      source: { label: "Ministère", url: "https://x" },
      date: "2026-10-12T08:00:00.000Z",
    });
  });
});

describe("getDepartementTerritoire", () => {
  beforeEach(() => {
    mocks.mandateCount.mockResolvedValue(0);
    mocks.mandateGroupBy.mockResolvedValue([]);
  });

  it("valide le code, la lettre et la page", async () => {
    expect(await getDepartementTerritoire("1; DROP")).toBeNull();
    expect(await getDepartementTerritoire("13", { page: 0 })).toBeNull();
    expect(await getDepartementTerritoire("13", { page: 41 })).toBeNull();
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it("pagine par lettre avec un compteur exact et l'état du maire", async () => {
    mocks.queryRaw
      .mockResolvedValueOnce([
        { letter: "A", count: 2 },
        { letter: "M", count: 1 },
      ])
      .mockResolvedValueOnce([
        { id: "13001", name: "Aix-en-Provence", population: 147000 },
        { id: "13002", name: "Allauch", population: 21000 },
      ]);
    mocks.mandateFindMany.mockImplementation(async (args: { where: { type: string } }) =>
      args.where.type === "MAIRE"
        ? [
            { localData: { communeId: "13001" }, politician: person("maire-aix") },
            { localData: { communeId: "13002" }, politician: person("m1") },
            { localData: { communeId: "13002" }, politician: person("m2") },
          ]
        : []
    );

    const result = await getDepartementTerritoire("13", { letter: "a" });

    expect(result?.communeCount).toBe(3);
    expect(result?.letterCounts).toEqual({ A: 2, M: 1 });
    expect(result?.communes).toMatchObject({ letter: "A", page: 1, total: 2, totalPages: 1 });
    expect(result?.communes.rows.map((r) => [r.name, r.maire.state])).toEqual([
      ["Aix-en-Provence", "ETABLI"],
      ["Allauch", "NON_ETABLI"],
    ]);
    expect(JSON.stringify(result)).not.toContain('"m1"');
    // Mandats exécutifs saisis à la main : rien d'enregistré ne veut pas dire « pas de président ».
    expect(result?.presidence.state).toBe("NON_ETABLI");
    expect(result?.conseil.state).toBe("NON_ETABLI");
    expect(mocks.departementVintages).toHaveBeenCalledWith("13");
    expect(result?.populationVintages).toEqual([]);
  });
});

describe("getRegionTerritoire, conseil régional", () => {
  it("range la présidence puis les vice-présidences par rang, puis l'ordre alphabétique", async () => {
    mocks.communeGroupBy.mockResolvedValue([]);
    mocks.mandateGroupBy.mockResolvedValue([]);
    mocks.mandateCount.mockResolvedValue(0);
    const row = (lastName: string, functionLabel: string | null) => ({
      lastName,
      firstName: "A",
      subdivisionLabel: "Finistère",
      functionLabel,
      registerDate: new Date("2026-08-11T12:00:00Z"),
    });
    mocks.conseilFindMany.mockResolvedValue([
      row("Zed", null),
      row("Bon", "10ème Vice-président du conseil régional"),
      row("Alp", null),
      row("Chef", "Présidente du conseil régional"),
      row("Deux", "2ème Vice-président du conseil régional"),
    ]);

    const region = await getRegionTerritoire("bretagne");

    expect(region?.conseil.state).toBe("DISPONIBLE");
    expect(region?.conseil.recordedCount).toBe(5);
    expect(region?.conseil.membres.map((m) => m.lastName)).toEqual([
      "Chef",
      "Deux",
      "Bon",
      "Alp",
      "Zed",
    ]);
    expect(region?.conseil.registerDate).toBe("2026-08-11T12:00:00.000Z");
    expect(mocks.conseilFindMany.mock.calls[0]?.[0].where).toEqual({
      niveau: "REGIONAL",
      territoryCode: "53",
    });
    // Aucun mandat saisi : la présidence vient du registre, sans fiche associée.
    expect(region?.presidence.person).toBeNull();
    expect(region?.presidence.registre).toEqual({
      fullName: "A Chef",
      title: "Présidente du conseil régional",
    });
    expect(region?.coverage.find((c) => c.bloc === "presidence")?.state).toBe("DISPONIBLE");
  });

  it("garde une présidence établie par un mandat, sans la remplacer par le registre", async () => {
    mocks.communeGroupBy.mockResolvedValue([]);
    mocks.mandateGroupBy.mockResolvedValue([]);
    mocks.mandateCount.mockResolvedValue(0);
    mocks.mandateFindMany.mockImplementation(async (args: { where: { type?: string } }) =>
      args.where.type === "PRESIDENT_REGION"
        ? [
            {
              title: "Président du conseil régional",
              lastConfirmedAt: null,
              source: "RNE",
              politician: {
                slug: "titulaire",
                fullName: "Titulaire Saisi",
                photoUrl: null,
                civility: null,
                publicationStatus: "PUBLISHED",
              },
            },
          ]
        : []
    );
    mocks.conseilFindMany.mockResolvedValue([
      {
        lastName: "Autre",
        firstName: "Nom",
        subdivisionLabel: null,
        functionLabel: "Président du conseil régional",
        registerDate: new Date("2026-08-11T12:00:00Z"),
      },
    ]);

    const region = await getRegionTerritoire("bretagne");

    expect(region?.presidence.state).toBe("ETABLI");
    expect(region?.presidence.registre).toBeNull();
  });
});

describe("getRegionTerritoire", () => {
  it("renvoie null pour un slug inconnu, sans requête", async () => {
    expect(await getRegionTerritoire("atlantide")).toBeNull();
    expect(mocks.communeGroupBy).not.toHaveBeenCalled();
  });

  it("liste les départements avec leurs comptes, sans présumer l'absence d'exécutif", async () => {
    mocks.communeGroupBy.mockResolvedValue([
      { departmentCode: "22", _count: { _all: 344 } },
      { departmentCode: "35", _count: { _all: 332 } },
    ]);
    mocks.mandateGroupBy.mockResolvedValue([]);
    mocks.mandateCount.mockResolvedValue(0);

    const region = await getRegionTerritoire("bretagne");

    expect(region?.departements.map((d) => d.code)).toEqual(["22", "29", "35", "56"]);
    expect(region?.departements.find((d) => d.code === "29")?.communeCount).toBe(0);
    expect(region?.communeCount).toBe(676);
    expect(region?.presidence.state).toBe("NON_ETABLI");
    expect(region?.conseil).toEqual({
      state: "NON_ETABLI",
      recordedCount: 0,
      membres: [],
      registerDate: null,
      source: null,
    });
    const presidenceWhere = mocks.mandateFindMany.mock.calls.find(
      ([args]) => args.where.type === "PRESIDENT_REGION"
    )?.[0].where;
    expect(presidenceWhere).toMatchObject({ OR: [{ constituency: "Bretagne" }] });
  });

  it("résout la présidence d'une région d'outre-mer par son département unique", async () => {
    mocks.communeGroupBy.mockResolvedValue([]);
    mocks.mandateGroupBy.mockResolvedValue([]);
    mocks.mandateCount.mockResolvedValue(0);
    mocks.mandateFindMany.mockImplementation(async (args: { where: { type: string } }) =>
      args.where.type === "PRESIDENT_REGION"
        ? [{ title: "Président", lastConfirmedAt: null, source: "MANUAL", politician: person("p") }]
        : []
    );

    const region = await getRegionTerritoire("martinique");

    expect(region?.presidence.state).toBe("ETABLI");
    const where = mocks.mandateFindMany.mock.calls.find(
      ([args]) => args.where.type === "PRESIDENT_REGION"
    )?.[0].where;
    expect(where).toMatchObject({
      OR: [{ constituency: "Martinique" }, { departmentCode: "972" }],
    });
  });
});

describe("searchTerritoires", () => {
  it("renvoie toutes les communes d'un code postal partagé", async () => {
    const shared = Array.from({ length: 22 }, (_, i) => ({
      id: `01${String(i).padStart(3, "0")}`,
      name: `Commune ${i}`,
      postalCodes: ["01300"],
      population: 100,
      departmentCode: "01",
    }));
    mocks.communeFindMany.mockResolvedValue(shared);
    mocks.communeFindUnique.mockResolvedValue(null);

    const result = await searchTerritoires("01300");

    expect(result.communes).toHaveLength(22);
    expect(mocks.communeFindMany.mock.calls[0]![0]).toMatchObject({
      where: { postalCodes: { has: "01300" } },
      take: 100,
    });
  });

  it("borne la recherche par nom et retombe sur le repli sans accent", async () => {
    mocks.queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: "27229",
        name: "Évreux",
        postalCodes: ["27000"],
        population: 47000,
        departmentCode: "27",
      },
    ]);

    const result = await searchTerritoires("evreux");

    expect(result.communes.map((c) => c.name)).toEqual(["Évreux"]);
    expect(result.communes[0]?.department.name).toBe("Eure");
    expect(mocks.queryRaw).toHaveBeenCalledTimes(2);
  });

  it("ignore une requête trop courte", async () => {
    expect(await searchTerritoires(" a ")).toEqual({ communes: [], departements: [], regions: [] });
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });
});
