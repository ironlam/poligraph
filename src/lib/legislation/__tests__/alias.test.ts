import { describe, expect, it } from "vitest";
import { normalizeDossierAlias, getDossierAliasSources, getPreferredDossierAlias } from "../alias";

describe("alias éditoriaux", () => {
  it("ne confond pas alias publié et principal", () => {
    expect(getPreferredDossierAlias([{ isPreferred: false }])).toBeUndefined();
    const preferred = { isPreferred: true, label: "Principal" };
    expect(getPreferredDossierAlias([{ isPreferred: false }, preferred])).toBe(preferred);
  });
  it("accepte plusieurs références et refuse les liens exécutables", () => {
    const sources = [
      { url: "https://www.senat.fr/exemple", label: "Sénat" },
      { url: "https://www.assemblee-nationale.fr/exemple", label: "Assemblée nationale" },
    ];
    expect(getDossierAliasSources(sources)).toEqual(sources);
    expect(getDossierAliasSources([{ url: "javascript:alert(1)", label: "Piège" }])).toEqual([]);
    expect(getDossierAliasSources(null)).toEqual([]);
  });
});

describe("normalizeDossierAlias", () => {
  it.each([
    ["Loi Duplomb", "duplomb"],
    [" loi-duplomb ", "duplomb"],
    ["LOI YADAN", "yadan"],
    ["Loi d'orientation agricole", "d orientation agricole"],
  ])("normalise %s", (input, expected) => {
    expect(normalizeDossierAlias(input)).toBe(expected);
  });
});
