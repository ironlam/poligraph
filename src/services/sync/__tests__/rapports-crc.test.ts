import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  flux: vi.fn(),
  page: vi.fn(),
  existants: vi.fn(),
  communes: vi.fn(),
  createMany: vi.fn(),
}));
vi.mock("@/lib/api/ccomptes", () => ({
  fetchFluxJuridiction: h.flux,
  fetchPagePublication: h.page,
}));
vi.mock("@/lib/db", () => ({
  db: {
    territoireEvenement: { findMany: h.existants, createMany: h.createMany },
    commune: { findMany: h.communes },
  },
}));

import { syncRapportsCrc as sync } from "../rapports-crc";

const DEPUIS = new Date("2026-10-23T00:00:00Z");
const syncRapportsCrc = (o: { dryRun: boolean; pauseMs: number }) => sync({ ...o, depuis: DEPUIS });

const URL_ = (slug: string) => `https://www.ccomptes.fr/fr/publications/${slug}`;
const pub = (titre: string, slug: string, publieLe = "2026-11-20T23:30:00Z") => ({
  titre,
  url: URL_(slug),
  publieLe: new Date(publieLe),
});
const ROD = '<a data-document="Rapport d&#039;observations définitives">';
const AVIS = '<a data-document="Avis de contrôle budgétaire">';

beforeEach(() => {
  vi.clearAllMocks();
  // Only the Grand Est chamber (143) publishes; every other feed is empty.
  h.flux.mockImplementation(async (id: number) => ({
    publications:
      id === 143
        ? [
            pub("Département de la Meuse", "meuse"),
            pub("Commune de Minorville (Meurthe-et-Moselle)", "minorville"),
            pub("Commune de Bucy (Aisne)", "bucy"),
            pub("Communauté de communes du Pays fléchois (Sarthe)", "cc"),
            pub("Commune de Gaillard (Haute-Savoie) (2e avis)", "gaillard"),
            pub(
              "Commune de Saint-Pierre (Saint-Pierre-et-Miquelon)",
              "spm",
              "2013-11-14T10:00:00Z"
            ),
          ]
        : [],
    ignores: 0,
  }));
  h.page.mockImplementation(async (url: string) => (url.endsWith("gaillard") ? AVIS : ROD));
  h.existants.mockResolvedValue([]);
  h.communes.mockResolvedValue([
    { id: "54370", name: "Minorville", departmentCode: "54" },
    { id: "02001", name: "Bucy", departmentCode: "02" },
    { id: "02002", name: "Bucy", departmentCode: "02" },
  ]);
  h.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({
    count: data.length,
  }));
});

describe("syncRapportsCrc", () => {
  it("prévoit un brouillon par rapport d'observations, sans rien écrire en aperçu", async () => {
    const r = await syncRapportsCrc({ dryRun: true, pauseMs: 0 });
    expect(r.notices.map((n) => [n.territoryType, n.territoryCode, n.rattachement])).toEqual([
      ["DEP", "55", "PROPOSE"],
      ["COM", "54370", "PROPOSE"],
      ["COM", null, "AMBIGU"],
    ]);
    expect(r.notices.every((n) => n.status === "DRAFT")).toBe(true);
    expect(r.ecartes).toEqual({ HORS_COLLECTIVITE: 1, ANTERIEUR: 1, AVIS_BUDGETAIRE: 1 });
    expect(h.createMany).not.toHaveBeenCalled();
    expect(h.page).not.toHaveBeenCalledWith(URL_("cc"));
    expect(h.page).not.toHaveBeenCalledWith(URL_("spm"));
  });

  it("date la notice du jour de Paris et la clé de l'adresse du rapport", async () => {
    const [meuse] = (await syncRapportsCrc({ dryRun: true, pauseMs: 0 })).notices;
    expect(meuse?.occurredOn.toISOString()).toBe("2026-11-21T00:00:00.000Z");
    expect(meuse?.dedupeKey).toBe(`rapport-crc:${URL_("meuse")}`);
    expect(meuse?.sourceLabel).toBe("Chambre régionale des comptes Grand Est");
  });

  it("ne relit pas la page d'un rapport déjà en base", async () => {
    h.existants.mockResolvedValue([{ dedupeKey: `rapport-crc:${URL_("meuse")}` }]);
    const r = await syncRapportsCrc({ dryRun: true, pauseMs: 0 });
    expect(h.page).not.toHaveBeenCalledWith(URL_("meuse"));
    expect(r.ecartes.DEJA_EN_BASE).toBe(1);
  });

  it("écrit en brouillon avec --write, y compris sans territoire", async () => {
    const r = await syncRapportsCrc({ dryRun: false, pauseMs: 0 });
    expect(r.written).toBe(3);
    const data = h.createMany.mock.calls[0]![0].data as Array<Record<string, unknown>>;
    expect(data.map((d) => d.status)).toEqual(["DRAFT", "DRAFT", "DRAFT"]);
    expect(data[2]).toMatchObject({ territoryCode: null, type: "RAPPORT_CRC" });
  });

  it("continue quand une chambre ou une page ne répond pas", async () => {
    h.flux.mockRejectedValueOnce(new Error("HTTP 503"));
    h.page.mockRejectedValueOnce(new Error("timeout"));
    const r = await syncRapportsCrc({ dryRun: true, pauseMs: 0 });
    expect(r.chambresEnErreur).toHaveLength(1);
    expect(r.ecartes.PAGE_ILLISIBLE).toBe(1);
  });
});
