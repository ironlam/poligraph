import { describe, expect, it } from "vitest";
import {
  PRESIDENTIAL_AFFAIRS_PATH,
  buildPresidentialAffairsHref,
  parsePresidentialAffairsPage,
  parsePresidentialAffairsSort,
} from "../affaires-listing";
import { PRESIDENTIAL_AFFAIRS_FILTER_KEYS } from "@/lib/seo/listing-filters";

describe("buildPresidentialAffairsHref", () => {
  it("garde l'adresse nue pour l'état par défaut, la seule indexable", () => {
    expect(buildPresidentialAffairsHref({ candidat: null, tri: "recentes", page: 1 })).toBe(
      PRESIDENTIAL_AFFAIRS_PATH
    );
  });

  it("conserve filtre et tri dans la pagination", () => {
    expect(
      buildPresidentialAffairsHref({ candidat: "jean-dupont", tri: "anciennes", page: 2 })
    ).toBe(`${PRESIDENTIAL_AFFAIRS_PATH}?candidat=jean-dupont&tri=anciennes&page=2`);
  });

  it("n'écrit que des clés déclarées dans le périmètre noindex", () => {
    const url = new URL(
      buildPresidentialAffairsHref({ candidat: "x", tri: "candidat", page: 3 }),
      "https://poligraph.fr"
    );
    for (const key of url.searchParams.keys()) {
      if (key === "page") continue;
      expect(PRESIDENTIAL_AFFAIRS_FILTER_KEYS as readonly string[]).toContain(key);
    }
  });
});

describe("parsers", () => {
  it("retombe sur le tri par défaut pour une valeur inconnue", () => {
    expect(parsePresidentialAffairsSort("gravite")).toBe("recentes");
    expect(parsePresidentialAffairsSort(undefined)).toBe("recentes");
    expect(parsePresidentialAffairsSort("candidat")).toBe("candidat");
  });

  it("refuse les pages non entières ou négatives", () => {
    expect(parsePresidentialAffairsPage("2abc")).toBe(1);
    expect(parsePresidentialAffairsPage("-1")).toBe(1);
    expect(parsePresidentialAffairsPage("3")).toBe(3);
  });
});
