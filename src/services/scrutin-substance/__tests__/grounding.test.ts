import { describe, it, expect } from "vitest";
import { findUngroundedNames } from "@/services/scrutin-substance/grounding";

const sources = [
  "Les fournisseurs d'accès à internet mesurent les volumes. L'exposé cite Google, Meta, Amazon, Netflix et Akamai, et les GAFAM selon l'ARCEP.",
  "M. Laurent Lhardit : le coût pour le groupe TF1 serait négligeable.",
];

describe("findUngroundedNames", () => {
  it("flags a company named in no source", () => {
    const text = "Les fournisseurs d'accès (comme Orange ou Free) mesureraient les volumes.";
    expect(findUngroundedNames(text, sources)).toEqual(["Orange", "Free"]);
  });

  it("accepts names present in the sources, whatever the case or accent", () => {
    const text =
      "La taxe viserait Google, Meta, Amazon et Netflix, ainsi que les GAFAM, selon l'Arcep. Le député Laurent Lhardit a cité TF1.";
    expect(findUngroundedNames(text, sources)).toEqual([]);
  });

  it("flags an acronym absent from the sources", () => {
    expect(findUngroundedNames("Elle viserait aussi les GAFAM et la DGFIP.", sources)).toEqual([
      "DGFIP",
    ]);
  });

  it("ignores the capital of a sentence start and of a markdown heading", () => {
    const text = "**Le débat**\n\nLes opposants ont objecté. Selon eux, la mesure coûterait cher.";
    expect(findUngroundedNames(text, sources)).toEqual([]);
  });

  it("does not require a well known acronym such as the PIB to appear in the sources", () => {
    expect(findUngroundedNames("Le PIB augmente.", ["Un texte sans rapport."])).toEqual([]);
  });

  it("does not require generic institutions to appear in the sources", () => {
    const text = "L'Assemblée nationale a adopté le texte, qui doit passer par le Sénat.";
    expect(findUngroundedNames(text, sources)).toEqual([]);
  });

  it("reads the label of a markdown link, not its url", () => {
    const text = "Voir le [dossier Orange](/parlement/dossiers/orange) pour la suite.";
    expect(findUngroundedNames(text, sources)).toEqual(["Orange"]);
  });

  it("reports each name once", () => {
    const text = "Chez Orange, comme chez Orange, rien ne change.";
    expect(findUngroundedNames(text, sources)).toEqual(["Orange"]);
  });

  it("tolerates a simple inflection of a name found in the sources", () => {
    expect(findUngroundedNames("Les Netflixiens paieraient.", ["Netflix est cité."])).toEqual([]);
  });

  it("does not take an elided article for a name (L'amendement, L'Assemblée)", () => {
    const text =
      "Les députés ont examiné un texte. Selon eux, l'amendement et L'Assemblée comptent.";
    expect(findUngroundedNames(text, sources)).toEqual([]);
  });

  it("does not take the first word of a paragraph after a heading for a name", () => {
    const text = "**Ce qui était proposé**\n\nCette mesure prévoit la suppression de la taxe.";
    expect(findUngroundedNames(text, ["Suppression de la taxe."])).toEqual([]);
  });

  it("does not take the first word of a bullet for a name", () => {
    const text =
      "Le débat :\n- Pour : un argument.\n- Contre : un autre argument.\nSelon eux, non.";
    expect(findUngroundedNames(text, ["un argument"])).toEqual([]);
  });

  describe("abbreviations the text defines itself", () => {
    const src = [
      "La taxe spéciale sur les conventions d'assurance est reversée à la branche famille. Le produit intérieur brut et la contribution sociale généralisée sont cités. L'allocation de solidarité aux personnes âgées.",
    ];

    it("accepts 'expansion (ABBR)' when the expansion rests on the sources", () => {
      const text =
        "La part de la taxe spéciale sur les conventions d'assurance (TSCA) augmente. Le produit intérieur brut (PIB) aussi.";
      expect(findUngroundedNames(text, src)).toEqual([]);
    });

    it("accepts 'ABBR (Expansion)' and the capitalised words of the expansion", () => {
      const text = "Elle porte sur la CSG (Contribution sociale généralisée) des apprentis.";
      expect(findUngroundedNames(text, src)).toEqual([]);
    });

    it("accepts an abbreviation that only keeps part of the initials (Ehpad)", () => {
      const text = "Les établissements pour personnes âgées dépendantes (Ehpad) sont visés.";
      expect(
        findUngroundedNames(text, ["Les établissements pour personnes âgées dépendantes."])
      ).toEqual([]);
    });

    it("still refuses an invented abbreviation whose expansion is not in the sources", () => {
      const text = "La taxe fictive sur les yachts de luxe (TFY) serait créée.";
      expect(findUngroundedNames(text, src)).toEqual(["TFY"]);
    });

    it("still refuses a name whose initials do not match the parenthesis", () => {
      const text = "Les fournisseurs d'accès à internet (Orange) mesureraient.";
      expect(findUngroundedNames(text, src)).toEqual(["Orange"]);
    });
  });

  it("does not take the first word after a closing quotation mark for a name", () => {
    const text =
      "Le texte prévoyait : « une séance ne peut être imposée. » Cela visait la victime.";
    expect(findUngroundedNames(text, ["une séance ne peut être imposée"])).toEqual([]);
  });
});
