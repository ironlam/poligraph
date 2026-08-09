import { describe, it, expect } from "vitest";
import {
  parseSenateSeries,
  getCouncilSeats,
  getSeriesTermStart,
  PLM_COUNCIL_SEATS,
} from "../senatoriales";

describe("parseSenateSeries", () => {
  // Regression: the Senate API returns "1"/"2" as strings, and the sync compared
  // `sen.serie === 1` on a field typed `number`. The branch was dead, the series
  // was never persisted, and 156 series-1 senators inherited the 2020 fallback.
  it("accepte la forme réellement renvoyée par l'API (chaîne)", () => {
    expect(parseSenateSeries("1")).toBe(1);
    expect(parseSenateSeries("2")).toBe(2);
  });

  it("accepte aussi la forme numérique", () => {
    expect(parseSenateSeries(1)).toBe(1);
    expect(parseSenateSeries(2)).toBe(2);
  });

  it("tolère les espaces autour de la valeur", () => {
    expect(parseSenateSeries(" 2 ")).toBe(2);
  });

  it("rejette toute valeur hors du domaine plutôt que de la convertir", () => {
    for (const raw of [0, 3, "3", "", "  ", "serie 1", null, undefined, {}, [], NaN, true]) {
      expect(parseSenateSeries(raw)).toBeNull();
    }
  });
});

describe("getSeriesTermStart", () => {
  it("place la prise de fonction de chaque série au 1er octobre suivant son scrutin", () => {
    expect(getSeriesTermStart(1).toISOString()).toBe("2023-10-01T00:00:00.000Z");
    expect(getSeriesTermStart(2).toISOString()).toBe("2020-10-01T00:00:00.000Z");
  });

  // The value is written to the database by the sync: two calls must not share
  // the same Date object.
  it("renvoie une copie à chaque appel", () => {
    expect(getSeriesTermStart(2)).not.toBe(getSeriesTermStart(2));
    expect(getSeriesTermStart(2)).toEqual(getSeriesTermStart(2));
  });
});

describe("getCouncilSeats", () => {
  // The generic scale of article L. 2121-2, applied by seed-communes.ts, caps at
  // 69 seats. All three PLM cities exceed it.
  it("substitue l'effectif légal pour Paris, Lyon et Marseille", () => {
    expect(getCouncilSeats("75056", 69)).toBe(163);
    expect(getCouncilSeats("69123", 69)).toBe(73);
    expect(getCouncilSeats("13055", 69)).toBe(111);
  });

  it("laisse Commune.totalSeats faire autorité partout ailleurs", () => {
    expect(getCouncilSeats("33063", 65)).toBe(65); // Bordeaux
    expect(getCouncilSeats("33036", 27)).toBe(27); // Bazas
  });

  it("propage l'absence sans la combler", () => {
    expect(getCouncilSeats("33036", null)).toBeNull();
  });

  it("garde la dérogation PLM même quand totalSeats est absent", () => {
    expect(getCouncilSeats("75056", null)).toBe(163);
  });

  it("ne couvre que les trois communes à régime particulier", () => {
    expect(Object.keys(PLM_COUNCIL_SEATS).sort()).toEqual(["13055", "69123", "75056"]);
  });
});
