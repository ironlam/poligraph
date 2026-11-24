import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DepartementTerritoire, PresidenceBlock } from "@/lib/data/territoires";
import { getCollectivitesForDepartment } from "@/config/collectivites-particulieres";
import { getRegionForDepartment, getTerritoireHorsRegion } from "@/config/regions";

const mocks = vi.hoisted(() => ({
  getDepartementTerritoire: vi.fn(),
  imageResponses: [] as { element: ReactNode }[],
}));

vi.mock("next/og", () => ({
  ImageResponse: class {
    constructor(element: ReactNode) {
      mocks.imageResponses.push({ element });
    }
  },
}));
vi.mock("@/lib/og-utils", () => ({
  OG_SIZE: { width: 1200, height: 630 },
  OgLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
  truncateOg: (text: string) => text,
}));
vi.mock("@/lib/data/territoires", () => ({
  getDepartementTerritoire: (...args: unknown[]) => mocks.getDepartementTerritoire(...args),
}));

import Image from "../opengraph-image";

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join(" ");
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return textContent((node.props as { children?: ReactNode }).children);
}

const NON_ETABLIE: PresidenceBlock = {
  state: "NON_ETABLI",
  person: null,
  title: null,
  lastConfirmedAt: null,
  source: null,
  registre: null,
};

function territoire(code: string, overrides: Partial<DepartementTerritoire> = {}) {
  const region = getRegionForDepartment(code);
  return {
    region: region ? { code: region.code, name: region.name, slug: region.slug } : null,
    territoireHorsRegion: getTerritoireHorsRegion(code),
    collectivitesParticulieres: getCollectivitesForDepartment(code),
    communeCount: 253,
    presidence: NON_ETABLIE,
    parlement: { deputeCount: 5, senateurCount: 0 },
    ...overrides,
  };
}

async function render(slug: string, data: unknown) {
  mocks.getDepartementTerritoire.mockResolvedValue(data);
  await Image({ params: Promise.resolve({ slug }) });
  return textContent(mocks.imageResponses[0]?.element);
}

describe("Open Graph d'un département Territoires", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.imageResponses.length = 0;
  });

  it("dit la même phrase que le bandeau, lit la page par le même lecteur et tait un compte vide", async () => {
    const registre = { fullName: "Alain Exemple", title: "Président du conseil départemental" };
    const text = await render(
      "vendee",
      territoire("85", { presidence: { ...NON_ETABLIE, registre } })
    );

    expect(mocks.getDepartementTerritoire).toHaveBeenCalledWith("85", { letter: null, page: 1 });
    expect(text).toContain("Département · Pays de la Loire");
    expect(text).toContain("Vendée");
    expect(text).toContain(
      "Alain Exemple préside le conseil départemental, d'après le registre national des élus."
    );
    expect(text).toMatch(/253 communes · 5 députés/);
    expect(text).not.toMatch(/sénateur/);
    expect(text).toContain("85");
  });

  it("ne parle pas de conseil départemental là où une collectivité le remplace", async () => {
    const text = await render("paris", territoire("75"));
    expect(text).toContain("Collectivité compétente : Ville de Paris.");
    expect(text).not.toMatch(/conseil départemental|Voir la note/);
  });

  it("rend une image de repli pour un slug inconnu, sans lire la base", async () => {
    const text = await render("inconnu", null);
    expect(text).toContain("Département non trouvé");
    expect(mocks.getDepartementTerritoire).not.toHaveBeenCalled();
  });
});
