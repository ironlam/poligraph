import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TerritoireSearchResult } from "@/lib/data/territoires";

const search = vi.hoisted(() => vi.fn());
vi.mock("@/lib/data/territoires", () => ({
  searchTerritoires: (q: string) => search(q),
}));

import RecherchePage, { metadata } from "../page";

const AIN = { code: "01", name: "Ain", slug: "ain" };

function commune(i: number, postalCodes = ["01300"]) {
  return {
    inseeCode: `01${String(100 + i).padStart(3, "0")}`,
    name: `Commune ${String.fromCharCode(65 + i)}`,
    postalCodes,
    population: 300 + i,
    department: AIN,
  };
}

const EMPTY: TerritoireSearchResult = { communes: [], departements: [], regions: [] };

async function renderPage(params: Record<string, string>) {
  return render(await RecherchePage({ searchParams: Promise.resolve(params) }));
}

describe("recherche de territoire", () => {
  beforeEach(() => {
    search.mockReset();
    search.mockResolvedValue(EMPTY);
  });

  it("reste hors index, avec un canonical sans requête", () => {
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates?.canonical).toBe("/territoires/recherche");
  });

  it("liste toutes les communes d'un code postal partagé et laisse choisir", async () => {
    search.mockResolvedValue({
      ...EMPTY,
      communes: Array.from({ length: 22 }, (_, i) => commune(i)),
    });
    await renderPage({ q: "01300" });

    expect(search).toHaveBeenCalledWith("01300");
    expect(
      screen.getByText((_, el) =>
        el?.tagName === "P"
          ? el.textContent === "Le code postal 01300 correspond à 22 communes. Choisissez la vôtre."
          : false
      )
    ).toBeInTheDocument();
    const group = screen.getByRole("region", { name: "Code postal 01300" });
    const links = within(group).getAllByRole("link");
    expect(links).toHaveLength(22);
    expect(links[0]).toHaveAttribute("href", "/territoires/communes/01100");
    expect(links[0]).toHaveTextContent("Commune A · Ain (01)");
  });

  it("sépare une commune trouvée par code INSEE des communes du code postal", async () => {
    search.mockResolvedValue({
      ...EMPTY,
      communes: [commune(0, ["01000"]), commune(1), commune(2)],
    });
    await renderPage({ q: "01300" });
    expect(
      within(screen.getByRole("region", { name: "Code INSEE" })).getAllByRole("link")
    ).toHaveLength(1);
    expect(
      within(screen.getByRole("region", { name: "Code postal 01300" })).getAllByRole("link")
    ).toHaveLength(2);
  });

  it("groupe communes, départements et régions pour une recherche par nom", async () => {
    search.mockResolvedValue({
      communes: [{ ...commune(0, ["42000"]), name: "Loire-sur-Rhône" }],
      departements: [
        { code: "42", name: "Loire", slug: "loire" },
        { code: "984", name: null, slug: null },
      ],
      regions: [{ code: "52", name: "Pays de la Loire", slug: "pays-de-la-loire" }],
    });
    await renderPage({ q: "loire" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Résultats pour « loire »");
    expect(screen.getByRole("link", { name: /^Loire · 42/ })).toHaveAttribute(
      "href",
      "/territoires/departements/loire"
    );
    // A territory without a department page is not offered as a link.
    expect(
      within(screen.getByRole("region", { name: "Départements" })).getAllByRole("link")
    ).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Pays de la Loire/ })).toHaveAttribute(
      "href",
      "/territoires/regions/pays-de-la-loire"
    );
  });

  it("dit clairement qu'aucun territoire ne correspond", async () => {
    await renderPage({ q: "zzzz" });
    expect(screen.getByText("Aucun territoire ne correspond à « zzzz ».")).toBeInTheDocument();
  });

  it("ne lance aucune requête sous deux caractères ni quand le quota est atteint", async () => {
    await renderPage({ q: "a" });
    expect(search).not.toHaveBeenCalled();
    await renderPage({ q: "rennes", limite: "1" });
    expect(search).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Trop de recherches");
  });

  it("garde la requête dans un formulaire GET utilisable sans JavaScript", async () => {
    const { container } = await renderPage({ q: "rennes" });
    const form = container.querySelector("form[role='search']")!;
    expect(form.getAttribute("action")).toBe("/territoires/recherche");
    expect(form.getAttribute("method")).toBe("get");
    expect(screen.getByLabelText("Rechercher un territoire")).toHaveValue("rennes");
  });
});
