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
});
