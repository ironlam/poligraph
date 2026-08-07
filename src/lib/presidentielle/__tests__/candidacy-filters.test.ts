import { describe, expect, it } from "vitest";
import {
  matchesCandidacyFilter,
  matchesCandidacyQuery,
  parseCandidacyFilter,
  type FilterableCandidacy,
} from "../candidacy-filters";

function candidacy(over: Partial<FilterableCandidacy> = {}): FilterableCandidacy {
  return {
    candidateName: "Alix Dupont",
    status: "DECLARE",
    partyLabel: "Parti Test",
    partyShortName: "PT",
    measureCount: 0,
    ...over,
  };
}

describe("parseCandidacyFilter", () => {
  it("retombe sur « toutes » pour une valeur d'URL inconnue ou absente", () => {
    // L'URL est publique et modifiable à la main : une valeur inventée ne doit pas vider la liste.
    expect(parseCandidacyFilter("depouillees")).toBe("depouillees");
    expect(parseCandidacyFilter("n-importe-quoi")).toBe("toutes");
    expect(parseCandidacyFilter(null)).toBe("toutes");
  });
});

describe("matchesCandidacyFilter", () => {
  it("range « évoquée » avec les pressenties", () => {
    // La nuance entre pressentie et évoquée porte sur le degré de sourçage, pas sur la nature :
    // qui filtre sur « pressenties » veut tous ceux qui ne sont pas encore déclarés.
    expect(matchesCandidacyFilter(candidacy({ status: "ENVISAGE" }), "pressenties")).toBe(true);
    expect(matchesCandidacyFilter(candidacy({ status: "PRESSENTI" }), "pressenties")).toBe(true);
    expect(matchesCandidacyFilter(candidacy({ status: "DECLARE" }), "pressenties")).toBe(false);
  });

  it("exclut une retirée des déclarées", () => {
    expect(matchesCandidacyFilter(candidacy({ status: "RETIRE" }), "declarees")).toBe(false);
    expect(matchesCandidacyFilter(candidacy({ status: "RETIRE" }), "toutes")).toBe(true);
  });

  it("filtre « dépouillé » sur nos mesures, pas sur l'existence d'un programme", () => {
    expect(matchesCandidacyFilter(candidacy({ measureCount: 3 }), "depouillees")).toBe(true);
    expect(matchesCandidacyFilter(candidacy({ measureCount: 0 }), "depouillees")).toBe(false);
  });
});

describe("matchesCandidacyQuery", () => {
  it("ignore les accents et la casse", () => {
    const melenchon = candidacy({ candidateName: "Jean-Luc Mélenchon" });
    expect(matchesCandidacyQuery(melenchon, "melenchon")).toBe(true);
    expect(matchesCandidacyQuery(melenchon, "MÉLENCHON")).toBe(true);
    expect(matchesCandidacyQuery(melenchon, "Melanchon")).toBe(false);
  });

  it("cherche aussi dans le parti et son sigle", () => {
    const row = candidacy({
      candidateName: "Alix Dupont",
      partyLabel: "Lutte ouvrière",
      partyShortName: "LO",
    });
    expect(matchesCandidacyQuery(row, "ouvriere")).toBe(true);
    expect(matchesCandidacyQuery(row, "lo")).toBe(true);
  });

  it("laisse tout passer sur une requête vide ou blanche", () => {
    expect(matchesCandidacyQuery(candidacy(), "")).toBe(true);
    expect(matchesCandidacyQuery(candidacy(), "   ")).toBe(true);
  });

  it("ne plante pas sur une candidature sans parti", () => {
    const row = candidacy({ partyLabel: null, partyShortName: null });
    expect(matchesCandidacyQuery(row, "parti")).toBe(false);
    expect(matchesCandidacyQuery(row, "alix")).toBe(true);
  });
});
