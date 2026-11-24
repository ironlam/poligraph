import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  politicians: vi.fn(),
  findMany: vi.fn(),
  groupBy: vi.fn(),
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));

vi.mock("next/cache", () => ({ cacheTag: h.cacheTag, cacheLife: h.cacheLife }));
vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: h.queryRaw,
    parrainage: { findMany: h.findMany, groupBy: h.groupBy },
    politician: { findMany: h.politicians },
  },
}));

import {
  COMMUNE_ROWS_LIMIT,
  DEPARTEMENT_ROWS_LIMIT,
  DERNIERES_LIMIT,
  getParrainagesCandidat,
  getParrainagesCandidats,
  getParrainagesCommune,
  getParrainagesCommuneBlocs,
  getParrainagesDepartement,
  getParrainagesDepartementResumes,
  getParrainagesTableauDeBord,
} from "@/lib/data/parrainages";

const SLUG = "presidentielle-2022";
const missingTable = { meta: { driverAdapterError: { cause: { kind: "TableDoesNotExist" } } } };
const candidat = (candidateName: string, total: number, over: Record<string, unknown> = {}) => ({
  candidateName,
  total,
  departements: 3,
  maxParDepartement: 2,
  candidacyName: null,
  politicianSlug: null,
  politicianName: null,
  ...over,
});
const ligne = (over: Record<string, unknown> = {}) => ({
  id: "p-1",
  civility: "Mme",
  firstName: "Claire",
  lastName: "MARTIN",
  mandateLabel: "Maire",
  constituencyLabel: "Saint-Exemple",
  departmentLabel: "Finistère",
  departmentCode: "29",
  communeCode: "29019",
  candidateName: "DURAND Paul",
  publishedOn: new Date("2022-03-07T00:00:00Z"),
  politician: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.queryRaw.mockResolvedValue([
    candidat("ZOLA Anne", 2),
    candidat("DURAND Paul", 7),
    candidat("ABEL Luc", 2),
  ]);
  h.findMany.mockResolvedValue([ligne()]);
  h.groupBy.mockResolvedValue([]);
  h.politicians.mockResolvedValue([]);
});

describe("getParrainagesCandidats", () => {
  it("trie par nombre puis par nom publié, sans autre critère", async () => {
    const candidats = await getParrainagesCandidats(SLUG);
    expect(candidats.map((c) => c.candidateName)).toEqual(["DURAND Paul", "ABEL Luc", "ZOLA Anne"]);
    expect(candidats[0]).toMatchObject({ slug: "durand-paul", total: 7, candidacyName: null });
  });

  it("compte un département une seule fois, que ses lignes soient reliées ou non à une candidature", async () => {
    await getParrainagesCandidats(SLUG);
    const sql = (h.queryRaw.mock.calls[0]?.[0] as { sql: string }).sql.replace(/\s+/g, " ");
    expect(sql).toContain('max(p."candidacyId")');
    expect(sql).toMatch(/GROUP BY 1, 2 \) t/);
    expect(sql).not.toMatch(/GROUP BY 1, 2, 3/);
  });

  it("relie un candidat sans candidature par la table validée à la main, si la fiche est publiée", async () => {
    h.queryRaw.mockResolvedValue([
      candidat("TAUBIRA Christiane", 274),
      candidat("ASSELINEAU François", 293),
      candidat("INCONNU Hors-Table", 5),
      candidat("MACRON Emmanuel", 2098, {
        candidacyName: "Emmanuel Macron",
        politicianSlug: "emmanuel-macron",
        politicianName: "Emmanuel Macron",
      }),
    ]);
    // The Asselineau profile is not published: the table alone gives no link.
    h.politicians.mockResolvedValue([
      { slug: "christiane-taubira", fullName: "Christiane Taubira" },
    ]);
    const bySlug = new Map((await getParrainagesCandidats(SLUG)).map((c) => [c.slug, c]));

    expect(h.politicians.mock.calls[0]?.[0].where).toEqual({
      slug: { in: ["christiane-taubira", "francois-asselineau"] },
      publicationStatus: "PUBLISHED",
    });
    expect(bySlug.get("taubira-christiane")).toMatchObject({
      politicianSlug: "christiane-taubira",
      politicianName: "Christiane Taubira",
      candidacyName: null,
    });
    expect(bySlug.get("asselineau-francois")).toMatchObject({
      politicianSlug: null,
      politicianName: null,
    });
    expect(bySlug.get("inconnu-hors-table")).toMatchObject({
      politicianSlug: null,
      politicianName: null,
    });
    expect(bySlug.get("macron-emmanuel")).toMatchObject({
      politicianSlug: "emmanuel-macron",
      politicianName: "Emmanuel Macron",
    });
  });

  it("pose le profil synced et le tag parrainages", async () => {
    await getParrainagesCandidats(SLUG);
    expect(h.cacheLife).toHaveBeenCalledWith("synced");
    expect(h.cacheTag).toHaveBeenCalledWith("parrainages");
  });

  it("rend une liste vide tant que la table n'existe pas, et relance toute autre erreur", async () => {
    h.queryRaw.mockRejectedValueOnce(missingTable);
    expect(await getParrainagesCandidats(SLUG)).toEqual([]);
    h.queryRaw.mockRejectedValueOnce(new Error("connexion perdue"));
    await expect(getParrainagesCandidats(SLUG)).rejects.toThrow("connexion perdue");
  });
});

describe("getParrainagesTableauDeBord", () => {
  it("additionne les candidats et donne la dernière publication", async () => {
    h.groupBy.mockResolvedValue([{ departmentCode: "29", _count: { _all: 4 } }]);
    const tableau = await getParrainagesTableauDeBord(SLUG);
    expect(tableau.total).toBe(11);
    expect(tableau.dernierePublication).toBe("2022-03-07");
    expect(tableau.departements).toEqual([{ code: "29", total: 4 }]);
    expect(h.findMany.mock.calls[0]?.[0]).toMatchObject({
      take: 1,
      orderBy: { publishedOn: "desc" },
    });
  });

  it("n'invente pas de date quand rien n'est publié", async () => {
    h.queryRaw.mockResolvedValue([]);
    h.findMany.mockResolvedValue([]);
    expect(await getParrainagesTableauDeBord(SLUG)).toEqual({
      total: 0,
      candidats: [],
      dernierePublication: null,
      departements: [],
    });
  });
});

describe("getParrainagesCandidat", () => {
  it("rend null pour un candidat absent de la liste, sans autre requête", async () => {
    expect(await getParrainagesCandidat(SLUG, "inconnu")).toBeNull();
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it("regroupe le féminin et le masculin d'un mandat et borne les dernières lignes", async () => {
    h.groupBy
      .mockResolvedValueOnce([
        { departmentLabel: "Finistère", departmentCode: "29", _count: { _all: 2 } },
        { departmentLabel: "Parlement européen", departmentCode: null, _count: { _all: 5 } },
      ])
      .mockResolvedValueOnce([
        { mandateLabel: "Députée", _count: { _all: 2 } },
        { mandateLabel: "Député", _count: { _all: 1 } },
        { mandateLabel: "Maire", _count: { _all: 4 } },
        { mandateLabel: "Libellé inconnu", _count: { _all: 9 } },
      ]);
    const detail = await getParrainagesCandidat(SLUG, "durand-paul");
    expect(detail?.candidat.candidateName).toBe("DURAND Paul");
    expect(detail?.parDepartement.map((d) => d.label)).toEqual(["Parlement européen", "Finistère"]);
    expect(detail?.parMandat).toEqual([
      { mandat: "MAIRE", label: "Maires", total: 4 },
      { mandat: "DEPUTE", label: "Députés", total: 3 },
    ]);
    expect(h.findMany.mock.calls[0]?.[0]).toMatchObject({
      take: DERNIERES_LIMIT,
      where: { election: { slug: SLUG }, candidateName: "DURAND Paul" },
    });
  });
});

describe("getParrainagesDepartement et getParrainagesCommune", () => {
  it("borne les lignes d'un département et trie ses candidats comme partout", async () => {
    h.groupBy.mockResolvedValue([
      { candidateName: "ZOLA Anne", _count: { _all: 1 } },
      { candidateName: "ABEL Luc", _count: { _all: 1 } },
    ]);
    const departement = await getParrainagesDepartement(SLUG, "29");
    expect(departement.total).toBe(2);
    expect(departement.candidats.map((c) => c.slug)).toEqual(["abel-luc", "zola-anne"]);
    expect(h.findMany.mock.calls[0]?.[0]).toMatchObject({
      take: DEPARTEMENT_ROWS_LIMIT,
      where: { election: { slug: SLUG }, departmentCode: "29" },
    });
  });

  it("ne donne le lien vers une fiche que si elle est publiée", async () => {
    h.findMany.mockResolvedValue([
      ligne({ politician: { slug: "claire-martin", publicationStatus: "PUBLISHED" } }),
      ligne({ id: "p-2", politician: { slug: "brouillon", publicationStatus: "DRAFT" } }),
      ligne({ id: "p-3" }),
    ]);
    const lignes = await getParrainagesCommune(SLUG, "29019");
    expect(lignes.map((l) => l.politicianSlug)).toEqual(["claire-martin", null, null]);
    expect(lignes[0]).toMatchObject({ publishedOn: "2022-03-07", lastName: "MARTIN" });
    expect(lignes[0]).not.toHaveProperty("politician");
    expect(h.findMany.mock.calls[0]?.[0]).toMatchObject({
      take: COMMUNE_ROWS_LIMIT,
      where: { communeCode: "29019" },
    });
  });

  it("rend une commune sans présentation comme une liste vide, table absente comprise", async () => {
    h.findMany.mockResolvedValueOnce([]);
    expect(await getParrainagesCommune(SLUG, "29019")).toEqual([]);
    h.findMany.mockRejectedValueOnce(missingTable);
    expect(await getParrainagesCommune(SLUG, "29019")).toEqual([]);
  });
});

describe("lecteurs des pages Territoires", () => {
  it("ne rend un bloc de commune que pour une élection qui a des présentations", async () => {
    h.findMany.mockResolvedValueOnce([ligne()]);
    expect(await getParrainagesCommuneBlocs("29019")).toEqual([
      { electionSlug: SLUG, lignes: [expect.objectContaining({ id: "p-1" })] },
    ]);
    h.findMany.mockResolvedValueOnce([]);
    expect(await getParrainagesCommuneBlocs("29019")).toEqual([]);
  });

  it("résume un département par élection, et rien quand il n'a aucune présentation", async () => {
    h.groupBy.mockResolvedValueOnce([
      { candidateName: "A", _count: { _all: 40 } },
      { candidateName: "B", _count: { _all: 2 } },
    ]);
    expect(await getParrainagesDepartementResumes("29")).toEqual([
      { electionSlug: SLUG, total: 42, candidats: 2 },
    ]);
    expect(h.groupBy.mock.calls[0]?.[0].where).toEqual({
      election: { slug: SLUG },
      departmentCode: "29",
    });
    h.groupBy.mockResolvedValueOnce([]);
    expect(await getParrainagesDepartementResumes("29")).toEqual([]);
  });
});
