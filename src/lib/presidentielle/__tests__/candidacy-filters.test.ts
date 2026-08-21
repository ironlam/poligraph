import { describe, expect, it } from "vitest";
import {
  countCandidacyField,
  formatCandidacyFieldSummary,
  matchesCandidacyFilter,
  matchesCandidacyQuery,
  matchesPublishedProposals,
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

describe("filtres de candidatures", () => {
  it("retombe sur toutes pour une valeur d'URL inconnue", () => {
    expect(parseCandidacyFilter("retirees")).toBe("retirees");
    expect(parseCandidacyFilter("depouillees")).toBe("toutes");
    expect(parseCandidacyFilter(null)).toBe("toutes");
  });

  it("regroupe PRESSENTI et ENVISAGE sans les déduire du contenu", () => {
    expect(
      matchesCandidacyFilter(candidacy({ status: "PRESSENTI", measureCount: 4 }), "pressenties")
    ).toBe(true);
    expect(
      matchesCandidacyFilter(candidacy({ status: "ENVISAGE", measureCount: 0 }), "pressenties")
    ).toBe(true);
    expect(
      matchesCandidacyFilter(candidacy({ status: "RETIRE", measureCount: 4 }), "pressenties")
    ).toBe(false);
  });

  it("sépare le filtre de statut du filtre de propositions Poligraph", () => {
    const announcedWithoutProposal = candidacy({ status: "DECLARE", measureCount: 0 });
    expect(matchesCandidacyFilter(announcedWithoutProposal, "annoncees")).toBe(true);
    expect(matchesPublishedProposals(announcedWithoutProposal, true)).toBe(false);
    expect(matchesPublishedProposals(candidacy({ status: "RETIRE", measureCount: 2 }), true)).toBe(
      true
    );
  });

  it("cherche sans accents dans le nom, le parti et le sigle", () => {
    const row = candidacy({ candidateName: "Jean-Luc Mélenchon", partyLabel: "Lutte ouvrière" });
    expect(matchesCandidacyQuery(row, "melenchon")).toBe(true);
    expect(matchesCandidacyQuery(row, "ouvriere")).toBe(true);
    expect(matchesCandidacyQuery(row, "absent")).toBe(false);
  });

  it("cherche un nom sans imposer la ponctuation inclusive", () => {
    expect(matchesCandidacyQuery(candidacy({ candidateName: "Candidat·e C" }), "Candidat C")).toBe(
      true
    );
  });
});

describe("compteurs dynamiques", () => {
  const rows = [
    candidacy({ status: "DECLARE" }),
    candidacy({ status: "DECLARE" }),
    candidacy({ status: "PRESSENTI" }),
    candidacy({ status: "ENVISAGE" }),
    candidacy({ status: "RETIRE" }),
  ];

  it("compte les statuts depuis les données courantes", () => {
    expect(countCandidacyField(rows)).toEqual({
      total: 5,
      announced: 2,
      expected: 2,
      withdrawn: 1,
    });
  });

  it("accorde le résumé sans total codé en dur", () => {
    expect(formatCandidacyFieldSummary(rows)).toBe(
      "5 personnes suivies pour 2027 : 2 candidatures annoncées, 2 personnalités pressenties et 1 candidature retirée."
    );
  });
});
