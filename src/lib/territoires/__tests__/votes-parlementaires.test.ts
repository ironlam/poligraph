import { describe, expect, it } from "vitest";
import {
  decompteEnMots,
  positionEnMots,
  type PositionEnregistree,
} from "@/lib/territoires/votes-parlementaires";

describe("positionEnMots", () => {
  it("dit la position en mots", () => {
    expect(positionEnMots("POUR")).toBe("pour");
    expect(positionEnMots("CONTRE")).toBe("contre");
    expect(positionEnMots("ABSTENTION")).toBe("abstention");
  });

  it("une position absente des données est non enregistrée, jamais « absent »", () => {
    expect(positionEnMots(undefined)).toBe("position non enregistrée");
    const toutes: (PositionEnregistree | undefined)[] = [
      "POUR",
      "CONTRE",
      "ABSTENTION",
      "NON_VOTANT",
      "ABSENT",
      undefined,
    ];
    for (const p of toutes) expect(positionEnMots(p)).not.toMatch(/\babsente?\b/i);
  });
});

describe("position manquante prouvée", () => {
  it("dit « n'a pas pris part au vote » seulement quand c'est établi", () => {
    expect(positionEnMots(undefined, true)).toBe("n'a pas pris part au vote");
    expect(positionEnMots(undefined, false)).toBe("position non enregistrée");
    expect(positionEnMots("POUR", true)).toBe("pour");
  });

  it("sépare dans le décompte ceux qui n'ont pas voté des positions non enregistrées", () => {
    expect(decompteEnMots({ a: "CONTRE" }, ["a", "b", "c", "d"], ["b", "c"])).toBe(
      "1 contre, 2 n'ont pas pris part au vote, 1 position non enregistrée"
    );
    expect(decompteEnMots({}, ["b"], ["b"])).toBe("1 n'a pas pris part au vote");
  });
});

describe("decompteEnMots", () => {
  const positions: Record<string, PositionEnregistree> = {
    a: "POUR",
    b: "POUR",
    c: "CONTRE",
    d: "ABSTENTION",
    hors: "POUR",
  };

  it("compte les seuls députés du territoire, sans nom, dans un ordre fixe", () => {
    expect(decompteEnMots(positions, ["a", "b", "c", "d"])).toBe("2 pour, 1 contre, 1 abstention");
  });

  it("compte à part les positions non enregistrées et accorde le pluriel", () => {
    expect(decompteEnMots(positions, ["a", "x"])).toBe("1 pour, 1 position non enregistrée");
    expect(decompteEnMots({}, ["x", "y"])).toBe("2 positions non enregistrées");
  });

  it("laisse de côté un compte nul", () => {
    expect(decompteEnMots(positions, ["c"])).toBe("1 contre");
  });
});
