import { describe, expect, it } from "vitest";
import { functionRank, rangsExecutif } from "../executif";

const membre = (firstName: string, lastName: string, functionLabel: string | null) => ({
  firstName,
  lastName,
  functionLabel,
});

describe("functionRank", () => {
  it("place la tête du conseil avant les rangs, puis les autres fonctions, puis les membres", () => {
    expect(functionRank("Maire")).toBe(0);
    expect(functionRank("Président du conseil départemental")).toBe(0);
    expect(functionRank("Présidente du conseil régional")).toBe(0);
    expect(functionRank("1er adjoint au Maire")).toBe(1);
    expect(functionRank("12ème Vice-président du conseil régional")).toBe(12);
    expect(functionRank(null)).toBe(1000);
  });

  // Morbihan and Vendée, 2026-11-15: the page named a commission president as the president
  // of the departmental council, because the label also starts with "Président".
  it("ne prend ni un président de commission ni un maire délégué pour la tête du conseil", () => {
    expect(functionRank("Président de commission du conseil départemental")).toBe(500);
    expect(functionRank("Maire délégué")).toBe(500);
  });
});

describe("rangsExecutif", () => {
  it("ne garde que les rangs, dans l'ordre, sans le libellé du registre", () => {
    const rangs = rangsExecutif([
      membre("Zoé", "Conseillère", null),
      membre("Ali", "Dix", "10ème adjoint au Maire"),
      membre("Léa", "Deux", "2ème adjoint au Maire"),
      membre("Max", "Maire", "Maire"),
      membre("Tom", "Délégué", "Maire délégué"),
      membre("Eva", "Commission", "Président de commission du conseil départemental"),
      membre("Luc", "Un", "1er adjoint au Maire"),
    ]);
    expect(rangs).toEqual([
      { rang: 1, nom: "Luc Un" },
      { rang: 2, nom: "Léa Deux" },
      { rang: 10, nom: "Ali Dix" },
    ]);
  });

  it("liste les deux élus enregistrés au même rang, sans en choisir un", () => {
    const rangs = rangsExecutif([
      membre("Zoé", "B", "1er Vice-président du conseil régional"),
      membre("Ali", "A", "1er Vice-président du conseil régional"),
    ]);
    expect(rangs.map((r) => r.nom)).toEqual(["Ali A", "Zoé B"]);
  });

  it("rend une liste vide quand le registre ne donne aucun rang", () => {
    expect(rangsExecutif([membre("Max", "Maire", "Maire"), membre("Zoé", "C", null)])).toEqual([]);
  });
});
