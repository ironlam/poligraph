import { beforeEach, describe, expect, it, vi } from "vitest";
import { dossier } from "./fixtures";

const mocks = vi.hoisted(() => ({
  getCommuneDossier: vi.fn(),
  getCommuneElections: vi.fn(),
  getCommuneDecisions: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("next/og", () => ({ ImageResponse: class {} }));
vi.mock("@/lib/data/territoires", () => ({
  getCommuneDossier: (code: string) => mocks.getCommuneDossier(code),
}));
vi.mock("@/lib/data/territoire-elections", () => ({
  getCommuneElections: (code: string) => mocks.getCommuneElections(code),
}));
vi.mock("@/lib/data/territoire-decisions", () => ({
  getCommuneDecisions: (code: string) => mocks.getCommuneDecisions(code),
}));
vi.mock("@/lib/data/territoire-chiffres", () => ({ getCommuneChiffres: async () => null }));
vi.mock("@/lib/data/territoire-fil", () => ({ getFilTerritoire: async () => [] }));
vi.mock("@/lib/data/territoire-comptes", () => ({
  getComptesTerritoire: vi.fn(async () => ({ dernierExercice: null, agregats: [], source: null })),
}));
vi.mock("@/lib/data/parrainages", () => ({
  getParrainagesCommuneBlocs: async () => [],
  getParrainagesDepartementResumes: async () => [],
}));
vi.mock("@/lib/data/territoire-votes", () => ({
  getVotesDeputesDepartement: async () => ({ scrutins: [], deputeSlugs: [] }),
}));

import CommunePage, { generateMetadata as communeMetadata } from "../page";
import ElectionsPage, { generateMetadata as electionsMetadata } from "../elections/page";
import DecisionsPage, { generateMetadata as decisionsMetadata } from "../decisions/page";
import { TERRITOIRES_OG_IMAGE } from "@/lib/territoires/og-image";

// The fixture is Rennes (35238): `rennes-35238` is its only readable address.
const commune = { inseeCode: "35238", name: "Rennes" };
const params = (code: string) => ({ params: Promise.resolve({ code }) });
const withSearch = (code: string) => ({ ...params(code), searchParams: Promise.resolve({}) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCommuneDossier.mockResolvedValue(dossier());
  mocks.getCommuneElections.mockResolvedValue({
    commune,
    scrutins: [],
    indexSignals: { population: 220000, maireEtabli: true },
  });
  mocks.getCommuneDecisions.mockResolvedValue({ commune, periods: { mayors: [] } });
});

describe("un nom faux devant le bon code : 404, jamais la fiche d'une autre adresse", () => {
  const FAUX = ["brest-35238", "n-importe-quoi-35238", "Rennes-35238", "rennes--35238"];

  it.each(FAUX)("fiche de la commune : %s", async (segment) => {
    await expect(CommunePage(params(segment))).rejects.toThrow("NEXT_NOT_FOUND");
    expect((await communeMetadata(params(segment))).alternates).toBeUndefined();
  });

  it.each(FAUX)("page des élections : %s", async (segment) => {
    await expect(ElectionsPage(withSearch(segment))).rejects.toThrow("NEXT_NOT_FOUND");
    expect((await electionsMetadata(withSearch(segment))).alternates).toBeUndefined();
  });

  it.each(FAUX)("page des décisions : %s", async (segment) => {
    await expect(DecisionsPage(params(segment))).rejects.toThrow("NEXT_NOT_FOUND");
    expect((await decisionsMetadata(params(segment))).alternates).toBeUndefined();
  });
});

describe("l'adresse exacte répond toujours", () => {
  it("garde la canonical sur les trois pages", async () => {
    expect((await communeMetadata(params("rennes-35238"))).alternates?.canonical).toBe(
      "/territoires/communes/rennes-35238"
    );
    expect((await electionsMetadata(withSearch("rennes-35238"))).alternates?.canonical).toBe(
      "/territoires/communes/rennes-35238/elections"
    );
    expect((await decisionsMetadata(params("rennes-35238"))).alternates?.canonical).toBe(
      "/territoires/communes/rennes-35238/decisions"
    );
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("déclare l'image de la rubrique sur les trois pages, sans image propre à la commune", async () => {
    const images = [
      (await communeMetadata(params("rennes-35238"))).openGraph?.images,
      (await electionsMetadata(withSearch("rennes-35238"))).openGraph?.images,
      (await decisionsMetadata(params("rennes-35238"))).openGraph?.images,
    ];
    expect(images).toEqual([
      [TERRITOIRES_OG_IMAGE],
      [TERRITOIRES_OG_IMAGE],
      [TERRITOIRES_OG_IMAGE],
    ]);
    expect(TERRITOIRES_OG_IMAGE.url).toBe("/territoires/opengraph-image");
  });
});
