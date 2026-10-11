import { describe, expect, it } from "vitest";
import {
  affairResultBadge,
  categorizeResults,
  isTerritoireQuery,
  type GlobalSearchResponse,
} from "../search-results";

const EMPTY: GlobalSearchResponse = {
  politicians: [],
  parties: [],
  affairs: [],
  scrutins: [],
  factchecks: [],
  dossiers: [],
  communes: [],
  departements: [],
};

const POLITICIAN = {
  slug: "camille-exemple",
  fullName: "Camille Exemple",
  photoUrl: null,
  party: null,
  partyColor: null,
  mandate: "MAIRE",
};

const commune = (id: string, name: string) => ({
  id,
  name,
  departmentName: "Vienne",
  population: 1000,
});

describe("badge d'un résultat d'affaire", () => {
  it("affiche le statut quand la personne est mise en cause", () => {
    expect(affairResultBadge({ status: "CONDAMNATION_DEFINITIVE", involvement: "DIRECT" })).toBe(
      "Condamnation définitive"
    );
  });

  it("affiche le rôle d'un témoin, jamais le statut de la personne poursuivie", () => {
    expect(affairResultBadge({ status: "CONDAMNATION_DEFINITIVE", involvement: "INDIRECT" })).toBe(
      "Témoin/Secondaire"
    );
  });

  it("la palette de recherche reprend la même règle", () => {
    const categories = categorizeResults({
      ...EMPTY,
      affairs: [
        {
          slug: "a",
          title: "Affaire A",
          status: "CONDAMNATION_DEFINITIVE",
          involvement: "INDIRECT",
          politicianName: "Témoin",
          politicianSlug: "temoin",
        },
      ],
    });
    const affairs = categories.find((c) => c.key === "affairs");
    expect(affairs?.results[0]?.badge).toBe("Témoin/Secondaire");
  });
});

describe("groupe Territoires de la recherche", () => {
  it("remplace le groupe Communes et mène à la page commune Territoires", () => {
    const categories = categorizeResults({ ...EMPTY, communes: [commune("86194", "Poitiers")] });
    expect(categories.map((c) => c.label)).toEqual(["Territoires"]);
    expect(categories[0]?.results[0]).toMatchObject({
      href: "/territoires/communes/86194",
      primary: "Poitiers",
      secondary: "Commune, Vienne",
    });
  });

  it("montre les départements renvoyés, vers leur page département", () => {
    const categories = categorizeResults({
      ...EMPTY,
      departements: [{ code: "86", name: "Vienne", slug: "vienne" }],
    });
    expect(categories[0]?.results[0]).toMatchObject({
      href: "/territoires/departements/vienne",
      primary: "Vienne",
      secondary: "Département (86)",
    });
  });

  it("accepte une réponse sans départements", () => {
    const { departements: _omitted, ...withoutDepartements } = EMPTY;
    expect(categorizeResults(withoutDepartements)).toEqual([]);
  });

  it("place Territoires en tête pour un code postal", () => {
    const data = {
      ...EMPTY,
      politicians: [POLITICIAN],
      communes: [commune("86194", "Poitiers")],
    };
    expect(categorizeResults(data, "86000").map((c) => c.key)).toEqual([
      "territoires",
      "politicians",
    ]);
  });

  it("place Territoires en tête pour le nom exact d'une commune, même avec des personnes", () => {
    const data = {
      ...EMPTY,
      politicians: [{ ...POLITICIAN, fullName: "Jean Poitiers" }],
      communes: [commune("86194", "Poitiers")],
    };
    expect(categorizeResults(data, "poitiers").map((c) => c.key)).toEqual([
      "territoires",
      "politicians",
    ]);
  });

  it("place Territoires en tête pour un début de nom de commune sans personne correspondante", () => {
    const data = { ...EMPTY, communes: [commune("99001", "Saint-Exemple")] };
    expect(isTerritoireQuery("saint-ex", data)).toBe(true);
  });

  it("laisse Politiques en tête pour un nom de personne", () => {
    const data = {
      ...EMPTY,
      politicians: [POLITICIAN],
      communes: [commune("99002", "Camille-sur-Mer")],
    };
    expect(categorizeResults(data, "Camille").map((c) => c.key)).toEqual([
      "politicians",
      "territoires",
    ]);
  });

  it("garde l'ordre par défaut sans requête", () => {
    const data = { ...EMPTY, politicians: [POLITICIAN], communes: [commune("86194", "Poitiers")] };
    expect(categorizeResults(data).map((c) => c.key)).toEqual(["politicians", "territoires"]);
  });
});
