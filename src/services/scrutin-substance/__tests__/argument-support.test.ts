// @vitest-environment node
import { describe, it, expect } from "vitest";
import { findUnsupportedSentences } from "../argument-support";

// Amendement n° 2127 (PLFSS 2027), débat du 22 octobre 2026.
const speakers = new Map([
  ["4201507", "Mme Joëlle Mélin"],
  ["4201511", "M. Thibault Bazin"],
  ["4201513", "M. Thibault Bazin"],
]);
const forCitations = [
  {
    paragraphId: "4201507",
    quote:
      "plutôt que de taxer, il est préférable d’améliorer l’information des consommateurs grâce à l’affichage d’informations qui ne sont pas prises en compte dans le nutri-score : le stockage du carbone par les prairies, la déforestation importée, la consommation d’énergie des serres chauffées",
    scope: "target" as const,
  },
];
const againstCitations = [
  {
    paragraphId: "4201511",
    quote: "l’abus de rapports nuit à la santé de la démocratie représentative",
    scope: "target" as const,
  },
  {
    paragraphId: "4201513",
    quote: "évitons d’en introduire et cantonnons-nous au rôle de législateur financier",
    scope: "target" as const,
  },
];

describe("findUnsupportedSentences", () => {
  it("refuses the 2127 'pour' text that borrows the amendment's statement of reasons", () => {
    const text =
      "Plutôt que d'étendre la fiscalité comportementale qui pèse sur le pouvoir d'achat des ménages, il est préférable d'améliorer l'information des consommateurs en complétant le Nutri-Score avec des critères comme l'impact des pesticides, le degré de transformation des aliments ou les modes de production, ce qui pourrait réduire les dépenses de l'assurance maladie en améliorant la santé publique.";
    expect(findUnsupportedSentences(text, forCitations, speakers)).toHaveLength(1);
  });

  it("refuses the 2127 'contre' text whose claims go beyond the two quotes", () => {
    const text =
      "Les demandes de rapports alourdissent le travail parlementaire et nuisent à l'efficacité de la démocratie représentative. Le rôle du législateur financier devrait se limiter à des mesures concrètes plutôt qu'à des évaluations.";
    expect(findUnsupportedSentences(text, againstCitations, speakers)).toHaveLength(2);
  });

  it("accepts sentences that stay on their quotes and name the speaker and role", () => {
    expect(
      findUnsupportedSentences(
        "Mme Mélin estime qu'il est préférable d'améliorer l'information des consommateurs plutôt que de taxer.",
        forCitations,
        speakers
      )
    ).toEqual([]);
    expect(
      findUnsupportedSentences(
        "Le rapporteur général, M. Bazin, juge que l'abus de rapports nuit à la démocratie représentative.",
        againstCitations,
        speakers
      )
    ).toEqual([]);
  });

  it("supports a sentence only through the quotes of its own side", () => {
    const text = "M. Bazin juge que l'abus de rapports nuit à la démocratie représentative.";
    expect(findUnsupportedSentences(text, forCitations, speakers)).toHaveLength(1);
  });

  it("returns nothing for an empty side", () => {
    expect(findUnsupportedSentences("", [], speakers)).toEqual([]);
  });
});
