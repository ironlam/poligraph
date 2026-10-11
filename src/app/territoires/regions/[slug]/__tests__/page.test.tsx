import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegionTerritoire } from "@/lib/data/territoires";
import { getCollectivitesForRegion } from "@/config/collectivites-particulieres";
import { getRegionBySlug } from "@/config/regions";
import { DEPARTMENT_OUTLINES } from "@/config/territoires-shapes";

const mocks = vi.hoisted(() => ({
  getRegionTerritoire: vi.fn(),
  getElections: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  imageResponses: [] as ReactNode[],
}));

vi.mock("@/lib/data/territoires", () => ({
  getRegionTerritoire: (slug: string) => mocks.getRegionTerritoire(slug),
}));
vi.mock("@/lib/data/elections", () => ({
  getElections: (type: string) => mocks.getElections(type),
}));
vi.mock("next/navigation", () => ({ notFound: () => mocks.notFound() }));
vi.mock("next/og", () => ({
  ImageResponse: class {
    constructor(element: ReactNode) {
      mocks.imageResponses.push(element);
    }
  },
}));

import RegionPage, { dynamicParams, generateMetadata, generateStaticParams } from "../page";
import OgImage from "../opengraph-image";
import { regionOutlineDataUri } from "@/lib/territoires/region-og-shape";

const COG = { label: "Code officiel géographique 2026 (INSEE)", url: "https://www.insee.fr" };

function region(slug: string, overrides: Partial<RegionTerritoire> = {}): RegionTerritoire {
  const r = getRegionBySlug(slug)!;
  return {
    region: {
      code: r.code,
      name: r.name,
      slug: r.slug,
      chefLieu: r.chefLieu,
      outreMer: r.outreMer,
      source: COG,
    },
    collectivitesParticulieres: getCollectivitesForRegion(r.code),
    departements: r.departmentCodes.map((code, i) => ({
      code,
      name: `Département ${String.fromCharCode(65 + i)}`,
      slug: `departement-${code.toLowerCase()}`,
      communeCount: 100 + i,
      deputeCount: i === 0 ? 0 : 3,
      senateurCount: i === 0 ? 0 : 2,
    })),
    communeCount: 1202,
    presidence: {
      state: "ABSENT",
      person: null,
      title: null,
      lastConfirmedAt: null,
      source: null,
    },
    conseil: { state: "ABSENT", recordedCount: 0 },
    coverage: [
      { bloc: "departements", state: "DISPONIBLE", source: COG, date: null },
      { bloc: "presidence", state: "ABSENT", source: null, date: null },
    ],
    ...overrides,
  };
}

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe("page région", () => {
  beforeEach(() => {
    mocks.getRegionTerritoire.mockReset();
    mocks.getElections.mockReset();
    mocks.getElections.mockResolvedValue([
      { slug: "regionales-2028", title: "Élections régionales de 2028", round1Date: null },
    ]);
    mocks.imageResponses.length = 0;
  });

  it("prérend les 18 régions et refuse tout autre slug", async () => {
    const slugs = generateStaticParams().map((p) => p.slug);
    expect(slugs).toHaveLength(18);
    expect(slugs).toEqual(expect.arrayContaining(["bretagne", "corse", "la-reunion", "grand-est"]));
    expect(dynamicParams).toBe(false);

    mocks.getRegionTerritoire.mockResolvedValue(null);
    await expect(RegionPage(params("atlantide"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("est toujours indexable, avec un canonical et des chiffres réels", async () => {
    mocks.getRegionTerritoire.mockResolvedValue(region("bretagne"));
    const meta = await generateMetadata(params("bretagne"));
    expect(meta.robots).toBeUndefined();
    expect(meta.alternates?.canonical).toBe("/territoires/regions/bretagne");
    expect(meta.description).toContain("4 départements et 1 202 communes");
  });

  it("rend une région de métropole : silhouette décorative, départements liés, état de la présidence", async () => {
    mocks.getRegionTerritoire.mockResolvedValue(region("bretagne"));
    const { container } = render(await RegionPage(params("bretagne")));

    expect(screen.getByRole("heading", { level: 1, name: "Bretagne" })).toBeInTheDocument();
    const banner = container.querySelector("section[aria-labelledby='region-titre']")!;
    const svg = banner.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("aria-hidden")).toBe("true");
    expect(banner.textContent).toContain("Présidence non établie dans nos données");

    const list = screen.getByRole("region", { name: "Départements" });
    const links = within(list).getAllByRole("link");
    expect(links).toHaveLength(4);
    expect(links[0]).toHaveAttribute("href", "/territoires/departements/departement-22");
    expect(links[0]).toHaveTextContent("100 communes");

    // Parliament: counts are shown, an absence is said, never a zero.
    const parlement = screen.getByRole("region", { name: "Au Parlement" });
    expect(parlement.textContent).toContain("Aucun parlementaire en fonction dans nos données");
    expect(parlement.textContent).not.toMatch(/\b0 député/);

    expect(screen.getByRole("link", { name: /Élections régionales de 2028/ })).toHaveAttribute(
      "href",
      "/elections/regionales-2028"
    );
    expect(screen.getByRole("link", { name: /JSON/ })).toHaveAttribute(
      "href",
      "/api/v1/territoires/regions/bretagne"
    );
    expect(container.textContent).not.toMatch(new RegExp("Dossier curé|\\[N\\]|[\\u2013\\u2014]"));
  });

  it.each([
    ["la-reunion", "974"],
    ["guadeloupe", "971"],
    ["mayotte", "976"],
  ])("dessine la région d'outre-mer %s avec son propre contour", async (slug, code) => {
    mocks.getRegionTerritoire.mockResolvedValue(region(slug));
    const { container } = render(await RegionPage(params(slug)));
    const banner = container.querySelector("section[aria-labelledby='region-titre']")!;
    const svg = banner.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("viewBox")).toBe(DEPARTMENT_OUTLINES[code]!.viewBox);
    const paths = svg.querySelectorAll("path");
    expect(paths).toHaveLength(1);
    expect(paths[0]!.getAttribute("d")).toBe(DEPARTMENT_OUTLINES[code]!.d);
  });

  it("affiche la note sourcée de la Collectivité de Corse et ne propose pas les régionales", async () => {
    mocks.getRegionTerritoire.mockResolvedValue(region("corse"));
    render(await RegionPage(params("corse")));
    const note = screen.getByRole("region", { name: "Collectivité compétente" });
    expect(note).toHaveTextContent("Collectivité de Corse");
    expect(within(note).getByRole("link", { name: /Loi n° 2015-991/ })).toHaveAttribute(
      "href",
      expect.stringContaining("legifrance.gouv.fr")
    );
    expect(mocks.getElections).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Élections" })).toBeNull();
  });

  it("nomme la présidence quand elle est établie, avec sa source", async () => {
    mocks.getRegionTerritoire.mockResolvedValue(
      region("martinique", {
        presidence: {
          state: "ETABLI",
          person: {
            slug: "camille-exemple",
            fullName: "Camille Exemple",
            photoUrl: null,
            civility: null,
          },
          title: "Président du Conseil exécutif",
          lastConfirmedAt: "2026-09-01T00:00:00.000Z",
          source: { label: "Répertoire national des élus", url: null },
        },
      })
    );
    render(await RegionPage(params("martinique")));
    expect(screen.getByRole("link", { name: "Camille Exemple" })).toHaveAttribute(
      "href",
      "/politiques/camille-exemple"
    );
    expect(
      screen.getByText(/Source : Répertoire national des élus · confirmée le 1 septembre 2026/)
    ).toBeInTheDocument();
  });
});

describe("image Open Graph de région", () => {
  it("dessine le contour de chaque région, outre-mer compris, et aucun pour un nom inconnu", () => {
    expect(regionOutlineDataUri("Bretagne")).toMatch(/^data:image\/svg\+xml;base64,/);
    const reunion = regionOutlineDataUri("La Réunion")!;
    const svg = Buffer.from(reunion.split(",")[1]!, "base64").toString("utf-8");
    expect(svg).toContain(`viewBox="${DEPARTMENT_OUTLINES["974"]!.viewBox}"`);
    expect(svg).toContain(`d="${DEPARTMENT_OUTLINES["974"]!.d}"`);
    expect(regionOutlineDataUri("Atlantide")).toBeNull();
  });

  it("met la silhouette sur l'image d'une région d'outre-mer", async () => {
    mocks.getRegionTerritoire.mockResolvedValue(region("guyane"));
    await OgImage(params("guyane"));
    const html = JSON.stringify(mocks.imageResponses.at(-1));
    expect(html).toContain("data:image/svg+xml;base64,");
  });

  it("porte le nom, le nombre de départements et de communes", async () => {
    mocks.getRegionTerritoire.mockResolvedValue(region("bretagne"));
    await OgImage(params("bretagne"));
    const html = JSON.stringify(mocks.imageResponses.at(-1));
    expect(html).toContain("Bretagne");
    expect(html).toContain("Région · 4 départements");
    expect(html).toContain("1 202 communes · chef-lieu Rennes");
  });

  it("répond sans planter pour un slug inconnu", async () => {
    mocks.getRegionTerritoire.mockResolvedValue(null);
    await OgImage(params("atlantide"));
    expect(JSON.stringify(mocks.imageResponses.at(-1))).toContain("Région introuvable");
  });
});
