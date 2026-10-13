import { describe, expect, it } from "vitest";
import { evolutionSentence, populationEvolution } from "@/lib/territoires/population-evolution";

const pt = (millesime: number, value: number, producer = "INSEE") => ({
  millesime,
  value,
  producer,
  effectiveFrom: `${millesime + 3}-01-01`,
});

describe("évolution de la population", () => {
  it("compare deux millésimes nationaux de l'INSEE", () => {
    const e = populationEvolution([pt(2023, 6412), pt(2022, 6300)]);
    expect(e).toEqual({
      ok: true,
      from: { millesime: 2022, value: 6300 },
      to: { millesime: 2023, value: 6412 },
    });
  });

  it("refuse avec un seul millésime, sans rien inventer", () => {
    expect(populationEvolution([pt(2023, 6412)])).toEqual({
      ok: false,
      reason: "UN_SEUL_MILLESIME",
    });
    expect(populationEvolution([])).toEqual({ ok: false, reason: "UN_SEUL_MILLESIME" });
  });

  it("refuse deux producteurs différents", () => {
    expect(populationEvolution([pt(2023, 10), pt(2022, 9, "ISPF")])).toEqual({
      ok: false,
      reason: "PRODUCTEURS_DIFFERENTS",
    });
  });

  it("refuse une série hors fichiers nationaux, dont le périmètre n'est pas vérifié", () => {
    expect(populationEvolution([pt(2022, 10, "ISPF"), pt(2017, 9, "ISPF")])).toEqual({
      ok: false,
      reason: "SERIE_HORS_FICHIERS_NATIONAUX",
    });
    expect(populationEvolution([pt(2023, 10), pt(2017, 9)])).toEqual({
      ok: false,
      reason: "SERIE_HORS_FICHIERS_NATIONAUX",
    });
  });

  it("refuse des millésimes non croissants", () => {
    expect(populationEvolution([pt(2022, 10), pt(2023, 9)])).toEqual({
      ok: false,
      reason: "MILLESIMES_INCOMPARABLES",
    });
  });

  it("écrit une phrase neutre, en valeurs brutes", () => {
    const e = populationEvolution([pt(2023, 6412), pt(2022, 5948)]);
    if (!e.ok) throw new Error("attendu");
    const s = evolutionSentence(e);
    expect(s).toContain("est passée de 5");
    expect(s).toContain("à périmètre communal constant");
    expect(s).not.toMatch(/%|hausse|baisse|croissance|déclin|↑|↓/);
    const same = populationEvolution([pt(2023, 100), pt(2022, 100)]);
    if (!same.ok) throw new Error("attendu");
    expect(evolutionSentence(same)).toContain("est restée à 100 habitants");
  });
});
