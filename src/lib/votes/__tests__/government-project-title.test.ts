import { describe, expect, it } from "vitest";
import { governmentProjectTitleParts } from "../government-project-title";

describe("governmentProjectTitleParts", () => {
  it("sépare le projet de loi et la lecture", () => {
    expect(
      governmentProjectTitleParts(
        "l'ensemble du projet de loi relatif à la protection des enfants (première lecture)."
      )
    ).toEqual({
      bill: "Projet de loi relatif à la protection des enfants",
      reading: "Première lecture",
    });
  });

  it("raccourcit le libellé de commission mixte paritaire", () => {
    expect(
      governmentProjectTitleParts(
        "l'ensemble du projet de loi d'urgence pour Mayotte (texte de la commission mixte paritaire)."
      )
    ).toEqual({
      bill: "Projet de loi d'urgence pour Mayotte",
      reading: "Commission mixte paritaire",
    });
  });

  it("accepte l'apostrophe typographique et la majuscule initiale", () => {
    expect(
      governmentProjectTitleParts(
        "L’ensemble du projet de loi organique relatif au Département-Région de Mayotte (première lecture)."
      ).bill
    ).toBe("Projet de loi organique relatif au Département-Région de Mayotte");
  });

  it("garde une parenthèse interne au titre", () => {
    expect(
      governmentProjectTitleParts(
        "l'ensemble du projet de loi autorisant la ratification de la résolution LP.3(4) (première lecture)."
      )
    ).toEqual({
      bill: "Projet de loi autorisant la ratification de la résolution LP.3(4)",
      reading: "Première lecture",
    });
  });

  it("laisse un titre atypique lisible, sans lecture", () => {
    expect(governmentProjectTitleParts("motion de rejet préalable")).toEqual({
      bill: "Motion de rejet préalable",
      reading: null,
    });
  });
});
