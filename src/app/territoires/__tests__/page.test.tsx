import { cleanup, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TerritoiresEntry } from "@/lib/data/territoires";

const mocks = vi.hoisted(() => ({
  getTerritoiresEntry: vi.fn(),
  isFeatureEnabled: vi.fn(),
}));

vi.mock("@/lib/data/territoires", () => ({
  getTerritoiresEntry: () => mocks.getTerritoiresEntry(),
}));
vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: (name: string) => mocks.isFeatureEnabled(name),
}));

import TerritoiresPage, { metadata } from "../page";

const SOURCE = {
  label: "Code officiel géographique (INSEE), via geo.api.gouv.fr",
  url: "https://geo.api.gouv.fr",
};

function entry(): TerritoiresEntry {
  return {
    regions: [
      {
        code: "53",
        name: "Bretagne",
        slug: "bretagne",
        outreMer: false,
        departementCount: 4,
        communeCount: 1202,
      },
      {
        code: "94",
        name: "Corse",
        slug: "corse",
        outreMer: false,
        departementCount: 2,
        communeCount: 360,
      },
      {
        code: "04",
        name: "La Réunion",
        slug: "la-reunion",
        outreMer: true,
        departementCount: 1,
        communeCount: 24,
      },
    ],
    horsRegion: [
      {
        code: "987",
        name: "Polynésie française",
        statut: "Collectivité d'outre-mer",
        communeCount: 48,
      },
      {
        code: "989",
        name: "Île de Clipperton",
        statut: "Île du domaine public de l'État",
        communeCount: 1,
      },
    ],
    national: {
      communeCount: 34969,
      mairesEtablis: 34796,
      importedAt: "2026-08-10T04:00:00.000Z",
      source: SOURCE,
    },
  };
}

describe("page d'entrée Territoires", () => {
  beforeEach(() => {
    mocks.getTerritoiresEntry.mockResolvedValue(entry());
    mocks.isFeatureEnabled.mockResolvedValue(true);
  });

  it("est indexable, avec un canonical sans paramètre", () => {
    expect(metadata.robots).toBeUndefined();
    expect(metadata.alternates?.canonical).toBe("/territoires");
    expect(String(metadata.title)).not.toMatch(/Poligraph/);
  });

  it("affiche le titre, un formulaire de recherche GET qui fonctionne sans JavaScript", async () => {
    const { container } = render(await TerritoiresPage());
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Les élus et les décisions de votre territoire",
      })
    ).toBeInTheDocument();
    const form = container.querySelector("form[role='search']")!;
    expect(form.getAttribute("action")).toBe("/territoires/recherche");
    expect(form.getAttribute("method")).toBe("get");
    expect(screen.getByLabelText("Rechercher un territoire")).toHaveAttribute("name", "q");
  });

  it("affiche la couverture réelle, jamais un gabarit", async () => {
    const { container } = render(await TerritoiresPage());
    const text = container.textContent ?? "";
    expect(text).toContain("Données disponibles pour 34 969 communes");
    expect(text).toContain("maire établi pour 34 796");
    expect(text).toContain("10 août 2026");
    expect(text).not.toMatch(/\[N\]|\[DATE\]|\[ÉDITION\]|Dossier curé|dossiers curés/i);
    expect(text).not.toMatch(new RegExp("[\\u2013\\u2014]"));
  });

  it("liste les régions en texte sous l'ancre #regions, outre-mer à part", async () => {
    const { container } = render(await TerritoiresPage());
    const section = container.querySelector("section#regions") as HTMLElement;
    expect(section).not.toBeNull();
    expect(within(section).getByRole("link", { name: /Bretagne/ })).toHaveAttribute(
      "href",
      "/territoires/regions/bretagne"
    );
    expect(within(section).getByRole("link", { name: /La Réunion/ })).toHaveAttribute(
      "href",
      "/territoires/regions/la-reunion"
    );
    expect(within(section).getByText("Outre-mer")).toBeInTheDocument();
    // A COM with a department page links to its communes; Clipperton has none and stays text.
    expect(
      within(section).getByRole("link", { name: /Voir les 48 communes de Polynésie française/ })
    ).toHaveAttribute("href", "/territoires/departements/polynesie-francaise");
    expect(within(section).getByText("Île de Clipperton")).toBeInTheDocument();
    // The map lives in the banner, not beside the list.
    expect(section.querySelector("svg:not(.lucide)")).toBeNull();
  });

  it("place la carte de France décorative dans le bandeau", async () => {
    const { container } = render(await TerritoiresPage());
    const banner = container.querySelector('[aria-labelledby="territoires-titre"]') as HTMLElement;
    const map = banner.querySelector("svg:not(.lucide)");
    expect(map).not.toBeNull();
    expect(map?.getAttribute("aria-hidden")).toBe("true");
    for (const link of map?.querySelectorAll("a") ?? []) {
      expect(link.getAttribute("tabindex")).toBe("-1");
    }
  });

  it("propose les accès rapides et masque Mon député quand la rubrique est désactivée", async () => {
    render(await TerritoiresPage());
    expect(screen.getByRole("link", { name: /Municipales 2026/ })).toHaveAttribute(
      "href",
      "/elections/municipales-2026"
    );
    expect(screen.getByRole("link", { name: /Mon député/ })).toHaveAttribute("href", "/mon-depute");
    expect(screen.getByRole("link", { name: /Présidentielle 2027/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027"
    );

    cleanup();
    mocks.isFeatureEnabled.mockResolvedValue(false);
    render(await TerritoiresPage());
    expect(screen.queryByRole("link", { name: /Mon député/ })).toBeNull();
  });
});
