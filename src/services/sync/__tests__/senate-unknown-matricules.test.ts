import { describe, expect, it } from "vitest";
import {
  assertNoUnknownSenateMatricules,
  findUnknownMatricules,
  UnknownSenateMatriculesError,
} from "../senate-unknown-matricules";

describe("findUnknownMatricules", () => {
  it("retourne les matricules absents des ExternalId SENAT", () => {
    expect(findUnknownMatricules(["19001A", "26001X"], new Set(["19001A"]))).toEqual(["26001X"]);
  });

  it("ne retourne rien quand tous les matricules sont connus", () => {
    expect(findUnknownMatricules(["19001A"], new Set(["19001A"]))).toEqual([]);
  });
});

describe("assertNoUnknownSenateMatricules", () => {
  it("lève une erreur qui nomme chaque sénateur inconnu", () => {
    const run = () =>
      assertNoUnknownSenateMatricules([
        { matricule: "26001X", name: "Jeanne Exemple" },
        { matricule: "26002Y", name: "Paul Modèle" },
      ]);
    expect(run).toThrow(UnknownSenateMatriculesError);
    expect(run).toThrow(/Jeanne Exemple.*Paul Modèle/);
  });

  it("ne lève rien quand tous les matricules sont connus", () => {
    expect(() => assertNoUnknownSenateMatricules([])).not.toThrow();
  });
});
