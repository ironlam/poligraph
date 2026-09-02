import { describe, expect, it } from "vitest";
import { buildMeasureSeoDescription, truncateAtWord } from "../measure-seo";

describe("measure SEO", () => {
  it("produit une description bornée et centrée sur l'élection", () => {
    const description = buildMeasureSeoDescription({
      candidateName: "Gabriel Attal",
      themeLabel: "Logement & Urbanisme",
      text: "Créer des logements supplémentaires par surélévation des bâtiments existants.",
      details: null,
    });
    expect(description).toContain("Présidentielle 2027");
    expect(description).toContain("Gabriel Attal");
    expect(description.length).toBeLessThanOrEqual(160);
  });

  it("coupe entre deux mots", () => {
    expect(truncateAtWord("un deux trois quatre", 14)).toBe("un deux trois…");
  });
});
