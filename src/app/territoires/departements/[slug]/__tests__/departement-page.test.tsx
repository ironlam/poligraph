import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  DepartementCommuneRow,
  DepartementTerritoire,
  PresidenceBlock,
} from "@/lib/data/territoires";
import { getCollectivitesForDepartment } from "@/config/collectivites-particulieres";
import { getRegionForDepartment, getTerritoireHorsRegion } from "@/config/regions";
import { communeListCounter } from "@/components/territoires/CommuneIndex";
import { DEPARTMENT_OUTLINES } from "@/config/territoires-shapes";

const territoireMock = vi.fn();
const deputesMock = vi.fn();
const senateursMock = vi.fn();

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/data/territoires", () => ({
  getDepartementTerritoire: (...args: unknown[]) => territoireMock(...args),
}));
vi.mock("@/lib/data/departments", () => ({
  getDeputesByDepartment: (...args: unknown[]) => deputesMock(...args),
  getSenateursByDepartment: (...args: unknown[]) => senateursMock(...args),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { DepartementPageBody } from "../departement-page";

const PAGE_SIZE = 50;

function row(name: string, i: number, maire = true): DepartementCommuneRow {
  return {
    inseeCode: `27${String(i).padStart(3, "0")}`,
    name,
    population: 1000 + i,
    maire: maire
      ? {
          state: "ETABLI",
          person: { slug: `maire-${i}`, fullName: `Maire ${i}`, photoUrl: null, civility: null },
        }
      : { state: "NON_ETABLI", person: null },
  };
}

const NO_PRESIDENCE: PresidenceBlock = {
  state: "NON_ETABLI",
  person: null,
  title: null,
  lastConfirmedAt: null,
  source: null,
};

function territoire(
  code: string,
  opts: {
    letter?: string | null;
    page?: number;
    letterCounts?: Record<string, number>;
    rows?: DepartementCommuneRow[];
    presidence?: PresidenceBlock;
    populationVintages?: DepartementTerritoire["populationVintages"];
  } = {}
): DepartementTerritoire {
  const letterCounts = opts.letterCounts ?? { A: 37, B: 20, E: 17, M: 84 };
  const letter = opts.letter ?? null;
  const page = opts.page ?? 1;
  const communeCount = Object.values(letterCounts).reduce((n, c) => n + c, 0);
  const total = letter ? (letterCounts[letter] ?? 0) : communeCount;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const onPage = Math.max(0, Math.min(PAGE_SIZE, total - (page - 1) * PAGE_SIZE));
  const rows =
    opts.rows ??
    Array.from({ length: onPage }, (_, i) => row(`${letter ?? "A"}commune ${i}`, i, i !== 1));
  const region = getRegionForDepartment(code);
  return {
    department: { code, name: null, slug: null },
    region: region ? { code: region.code, name: region.name, slug: region.slug } : null,
    territoireHorsRegion: getTerritoireHorsRegion(code),
    collectivitesParticulieres: getCollectivitesForDepartment(code),
    communeCount,
    populationVintages: opts.populationVintages ?? [],
    letterCounts,
    communes: { letter, page, pageSize: PAGE_SIZE, total, totalPages, rows },
    presidence: opts.presidence ?? NO_PRESIDENCE,
    conseil: { state: "NON_ETABLI", recordedCount: 0 },
    parlement: { deputeCount: 0, senateurCount: 0 },
    coverage: [
      {
        bloc: "communes",
        state: "DISPONIBLE",
        source: { label: "COG", url: null },
        date: "2026-08-10T00:00:00.000Z",
      },
    ],
  };
}

function person(id: string, constituency: string) {
  return {
    id,
    slug: id,
    fullName: `Personne ${id}`,
    firstName: "P",
    lastName: id,
    photoUrl: null,
    blobPhotoUrl: null,
    currentParty: null,
    mandates: [{ constituency }],
  };
}

async function render(
  slug: string,
  data: DepartementTerritoire | null,
  query = { letter: null as string | null, page: 1 }
): Promise<Document> {
  territoireMock.mockResolvedValue(data);
  const html = renderToStaticMarkup(await DepartementPageBody({ slug, query }));
  return new DOMParser().parseFromString(html, "text/html");
}

const text = (doc: Document) => doc.body.textContent ?? "";

beforeEach(() => {
  territoireMock.mockReset();
  deputesMock.mockResolvedValue([person("d2", "Eure (2)"), person("d1", "Eure (1)")]);
  senateursMock.mockResolvedValue([person("s1", "Eure")]);
});

describe("page département : département ordinaire", () => {
  it("affiche le bandeau, le fil d'Ariane vers la région et les faits clés", async () => {
    const doc = await render("eure", territoire("27"));

    expect(doc.querySelector("h1")?.textContent).toBe("Eure (27)");
    const crumbs = [...doc.querySelectorAll('nav[aria-label="Fil d\'Ariane"] a')];
    expect(crumbs.map((a) => a.getAttribute("href"))).toEqual([
      "/territoires",
      "/territoires/regions/normandie",
    ]);
    expect(text(doc)).toContain("158");
    expect(text(doc)).toContain("2 députés · 1 sénateur");
    expect(text(doc)).toContain("Non établie");
    // Silhouette présente pour un département métropolitain, décorative.
    expect(doc.querySelector('section[aria-labelledby="departement-titre"] svg')).not.toBeNull();
    expect(
      doc
        .querySelector('section[aria-labelledby="departement-titre"] svg')
        ?.closest('[aria-hidden="true"]')
    ).not.toBeNull();
  });

  it("garde le bloc Parlement existant, députés triés par circonscription", async () => {
    const doc = await render("eure", territoire("27"));
    const links = [...doc.querySelectorAll("#parlement a")].map((a) => a.getAttribute("href"));
    expect(links).toEqual(["/politiques/d1", "/politiques/d2", "/politiques/s1"]);
  });

  it("affiche les compétences légales avec leur source Légifrance", async () => {
    const doc = await render("eure", territoire("27"));
    const conseil = doc.querySelector("#conseil");
    expect(conseil?.textContent).toContain("Compétences fixées par la loi");
    expect(conseil?.textContent).toContain(
      "composition du conseil départemental n'est pas établie"
    );
    expect(conseil?.querySelector('a[href*="legifrance.gouv.fr"]')).not.toBeNull();
  });

  it("nomme la présidence quand elle est établie, avec la mention de source", async () => {
    const doc = await render(
      "eure",
      territoire("27", {
        presidence: {
          state: "ETABLI",
          person: {
            slug: "presidente",
            fullName: "Présidente Test",
            photoUrl: null,
            civility: null,
          },
          title: null,
          lastConfirmedAt: null,
          source: null,
        },
      })
    );
    expect(doc.querySelectorAll('a[href="/politiques/presidente"]').length).toBeGreaterThan(0);
    expect(text(doc)).toContain("Source non précisée dans nos données");
  });

  it("lie chaque commune vers sa page Territoires, avec population et maire public", async () => {
    const doc = await render("eure", territoire("27"));
    const links = [...doc.querySelectorAll("#communes ul.overflow-hidden a")];
    expect(links).toHaveLength(PAGE_SIZE);
    expect(links[0]?.getAttribute("href")).toBe("/territoires/communes/27000");
    expect(links[0]?.textContent).toMatch(/1\s000 hab\./u);
    expect(links[0]?.textContent).toContain("Maire : Maire 0");
    expect(links[1]?.textContent).toContain("Maire non établi");
    expect(links[1]?.textContent).not.toContain("Maire 1");
  });

  it("date la population par son millésime en vigueur quand la série existe", async () => {
    const doc = await render(
      "eure",
      territoire("27", {
        populationVintages: [
          {
            millesime: 2023,
            effectiveFrom: "2026-01-01",
            producer: "INSEE",
            sourceLabel: "INSEE, populations de référence 2023",
            sourceUrl: "https://www.insee.fr/fr/statistiques/8680726",
            importedAt: "2026-10-11T08:00:00.000Z",
            communes: 585,
          },
        ],
      })
    );
    const footer = doc.querySelector("#communes p.border-t");
    expect(footer?.textContent).toContain(
      "Population municipale 2023, en vigueur au 1er janvier 2026 (INSEE)"
    );
    expect(footer?.textContent).not.toContain("geo.api.gouv.fr");
    expect(footer?.textContent).not.toContain("585 communes");
    expect(
      footer?.querySelector('a[href="https://www.insee.fr/fr/statistiques/8680726"]')
    ).not.toBeNull();
  });

  it("sans série, garde la source geo.api.gouv.fr sans millésime", async () => {
    const doc = await render("eure", territoire("27"));
    const footer = doc.querySelector("#communes p.border-t");
    expect(footer?.textContent).toContain("via geo.api.gouv.fr");
    expect(footer?.textContent).not.toMatch(/en vigueur/);
  });

  it("refuse une page au-delà de la fin de la liste", async () => {
    await expect(
      render("eure", territoire("27", { letter: "B", page: 2 }), { letter: "B", page: 2 })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("page département : index A à Z et pagination", () => {
  it("désactive les lettres sans commune et marque la lettre active", async () => {
    const doc = await render("eure", territoire("27", { letter: "M", page: 2 }), {
      letter: "M",
      page: 2,
    });
    const index = doc.querySelector('nav[aria-label="Communes par initiale"]')!;
    expect(index.querySelector('a[aria-current="page"]')?.textContent).toBe("M");
    // Pas de lien pour une lettre vide.
    expect([...index.querySelectorAll("a")].map((a) => a.textContent)).toEqual([
      "Toutes",
      "A",
      "B",
      "E",
      "M",
    ]);
    expect(index.textContent).toContain("Z : aucune commune");
    expect(
      index.querySelector('a[href="/territoires/departements/eure?lettre=M#communes"]')
    ).not.toBeNull();
  });

  it("annonce un compteur conforme au filtre actif et aux noms affichés", async () => {
    const doc = await render("eure", territoire("27", { letter: "M", page: 2 }), {
      letter: "M",
      page: 2,
    });
    const names = [...doc.querySelectorAll("#communes ul.overflow-hidden a span.font-bold")].map(
      (s) => s.textContent ?? ""
    );
    expect(names).toHaveLength(34);
    expect(names.every((n) => n.startsWith("M"))).toBe(true);
    expect(text(doc)).toContain("Communes 51 à 84 sur 84 commençant par M");
  });

  it("rend une pagination accessible avec des liens ?lettre=&page=", async () => {
    const doc = await render("eure", territoire("27", { letter: "M", page: 2 }), {
      letter: "M",
      page: 2,
    });
    const nav = doc.querySelector('nav[aria-label="Pages de la liste des communes"]')!;
    expect(nav.querySelector('a[aria-current="page"]')?.textContent).toBe("2");
    expect(nav.querySelector('a[rel="prev"]')?.getAttribute("href")).toBe(
      "/territoires/departements/eure?lettre=M#communes"
    );
    expect(nav.querySelector('a[rel="next"]')).toBeNull();
  });

  it("dit qu'une lettre est vide au lieu d'afficher une liste vide", async () => {
    const doc = await render("eure", territoire("27", { letter: "Q" }), { letter: "Q", page: 1 });
    expect(text(doc)).toContain("Aucune commune de ce département ne commence par Q.");
    expect(text(doc)).toContain("Aucune commune commençant par Q");
    expect(doc.querySelector('nav[aria-label="Pages de la liste des communes"]')).toBeNull();
  });

  it("range sous E une commune dont l'initiale est accentuée", async () => {
    const rows = [row("Écouis", 1), row("Ézy-sur-Eure", 2), row("Évreux", 3)];
    const doc = await render("eure", territoire("27", { letter: "E", rows }), {
      letter: "E",
      page: 1,
    });
    expect(text(doc)).toContain("Écouis");
    expect(
      doc.querySelector('nav[aria-label="Communes par initiale"] a[aria-current="page"]')
        ?.textContent
    ).toBe("E");
  });

  it("n'affiche pas d'index pour une liste qui tient sur une page", async () => {
    const doc = await render("la-reunion", territoire("974", { letterCounts: { S: 24 } }));
    expect(doc.querySelector('nav[aria-label="Communes par initiale"]')).toBeNull();
    expect(text(doc)).toContain("24 communes");
  });
});

describe("page département : collectivités à statut particulier", () => {
  it("Paris : la Ville de Paris, sans conseil départemental ni présidence", async () => {
    const doc = await render("paris", territoire("75", { letterCounts: { P: 1 } }));
    expect(text(doc)).toContain("Collectivité compétente : Ville de Paris");
    expect(doc.querySelector("#collectivite-competente")?.textContent).toContain("Loi n° 2017-257");
    expect(doc.querySelector("#conseil")).toBeNull();
    expect(text(doc)).not.toContain("Présidence du département");
    expect(text(doc)).not.toContain("Compétences fixées par la loi");
  });

  it("Rhône : note sur la Métropole de Lyon, conseil départemental conservé", async () => {
    const doc = await render("rhone", territoire("69"));
    const conseil = doc.querySelector("#conseil")!;
    expect(conseil.textContent).toContain("Métropole de Lyon");
    expect(conseil.textContent).toContain("distincte du département");
    expect(text(doc)).toContain("Présidence du département");
  });

  it("Corse-du-Sud : la Collectivité de Corse, région Corse dans le fil d'Ariane", async () => {
    const doc = await render("corse-du-sud", territoire("2A"));
    expect(text(doc)).toContain("Collectivité compétente : Collectivité de Corse");
    expect(doc.querySelector('a[href="/territoires/regions/corse"]')).not.toBeNull();
    expect(doc.querySelector("#conseil")).toBeNull();
  });

  it("Bas-Rhin : la Collectivité européenne d'Alsace", async () => {
    const doc = await render("bas-rhin", territoire("67"));
    expect(text(doc)).toContain("Collectivité européenne d'Alsace");
    expect(doc.querySelector("#conseil")).toBeNull();
  });

  it("Martinique : collectivité unique", async () => {
    const doc = await render("martinique", territoire("972"));
    expect(text(doc)).toContain("Collectivité territoriale de Martinique");
  });

  it("Mayotte : note sur le département-région", async () => {
    const doc = await render("mayotte", territoire("976"));
    expect(doc.querySelector("#conseil")?.textContent).toContain("Département de Mayotte");
    expect(doc.querySelector('a[href="/territoires/regions/mayotte"]')).not.toBeNull();
  });

  // Each overseas territory gets its own outline, never metropolitan France as an inset.
  it.each([
    ["la-reunion", "974"],
    ["guyane", "973"],
    ["saint-pierre-et-miquelon", "975"],
    ["polynesie-francaise", "987"],
    ["nouvelle-caledonie", "988"],
  ])("%s : silhouette de son propre territoire", async (slug, code) => {
    const doc = await render(slug, territoire(code));
    const svgs = [...doc.querySelectorAll('section[aria-labelledby="departement-titre"] svg')];
    expect(svgs).toHaveLength(1);
    expect(svgs[0]!.getAttribute("aria-hidden")).toBe("true");
    expect(svgs[0]!.getAttribute("viewBox")).toBe(DEPARTMENT_OUTLINES[code]!.viewBox);
    expect(svgs[0]!.querySelector("path")!.getAttribute("d")).toBe(DEPARTMENT_OUTLINES[code]!.d);
  });

  it("Saint-Pierre-et-Miquelon : statut affiché, aucune région", async () => {
    const doc = await render("saint-pierre-et-miquelon", territoire("975"));
    expect(text(doc)).toContain("Collectivité d'outre-mer");
    expect(doc.querySelector("#statut")?.textContent).toContain("aucune région");
    expect(doc.querySelector('a[href^="/territoires/regions/"]')).toBeNull();
    expect(doc.querySelector("#conseil")).toBeNull();
  });
});

describe("communeListCounter", () => {
  const base = { letter: null, page: 1, pageSize: 50, total: 0, totalPages: 1, rows: [] };
  const rows = (n: number) => Array.from({ length: n }, (_, i) => row(`A${i}`, i));

  it.each([
    [{ ...base, total: 332, totalPages: 7, rows: rows(50) }, "Communes 1 à 50 sur 332"],
    [{ ...base, letter: "A", total: 37, rows: rows(37) }, "37 communes commençant par A"],
    [{ ...base, letter: "A", total: 1, rows: rows(1) }, "1 commune commençant par A"],
    [
      { ...base, letter: "M", page: 2, total: 84, totalPages: 2, rows: rows(34) },
      "Communes 51 à 84 sur 84 commençant par M",
    ],
    [{ ...base, letter: "Q" }, "Aucune commune commençant par Q"],
  ])("%#", (communes, expected) => {
    expect(communeListCounter(communes)).toBe(expected);
  });
});
