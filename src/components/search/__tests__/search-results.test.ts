import { describe, expect, it } from "vitest";
import { affairResultBadge, categorizeResults, type GlobalSearchResponse } from "../search-results";

const EMPTY: GlobalSearchResponse = {
  politicians: [],
  parties: [],
  affairs: [],
  scrutins: [],
  factchecks: [],
  dossiers: [],
  communes: [],
};

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
