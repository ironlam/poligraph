import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PostalCodeSearch } from "@/components/politicians/PostalCodeSearch";

/** Mon député (#1052, Liens.html P1): once a commune is found, link to its Territoires page. */

function mockFetch(apiBody: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith("https://geo.api.gouv.fr/")) {
      return new Response(
        JSON.stringify([
          { nom: "Carcassonne", code: "11069", codeDepartement: "11", population: 1 },
        ])
      );
    }
    return new Response(JSON.stringify(apiBody));
  });
  vi.stubGlobal("fetch", fetchMock);
}

const BASE = {
  deputy: null,
  senators: [],
  commune: "Carcassonne",
  department: "Aude",
  departmentCode: "11",
  constituencyNumber: 1,
  multipleDeputies: false,
};

async function search() {
  render(<PostalCodeSearch />);
  fireEvent.change(screen.getByLabelText("Code postal"), { target: { value: "11000" } });
  fireEvent.click(screen.getByRole("button", { name: "Rechercher par code postal" }));
  await screen.findByText(/Résultats pour/);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PostalCodeSearch : lien vers Territoires", () => {
  it("relie la commune trouvée en base à sa page Territoires", async () => {
    mockFetch({ ...BASE, inseeCode: "11069" });
    await search();
    expect(
      screen.getByRole("link", { name: /Voir tout ce qui concerne Carcassonne/ })
    ).toHaveAttribute("href", "/territoires/communes/carcassonne-11069");
  });

  it("n'affiche pas de lien sans code de commune", async () => {
    mockFetch(BASE);
    await search();
    expect(screen.queryByRole("link", { name: /Voir tout ce qui concerne/ })).toBeNull();
  });
});
