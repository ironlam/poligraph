import { describe, expect, it } from "vitest";
import {
  FEHF_SENATE_SEATS,
  getSenateTerritorialConstituency,
  SENATE_TERRITORIAL_CONSTITUENCIES,
} from "../senate-seats";

describe("référentiel statutaire des sièges du Sénat", () => {
  it("reproduit les totaux légaux nationaux et par série", () => {
    const territorial = SENATE_TERRITORIAL_CONSTITUENCIES.reduce(
      (totals, constituency) => {
        totals[constituency.series] += constituency.seats;
        return totals;
      },
      { 1: 0, 2: 0 }
    );

    expect(territorial).toEqual({ 1: 164, 2: 172 });
    expect(territorial[1] + FEHF_SENATE_SEATS[1]).toBe(170);
    expect(territorial[2] + FEHF_SENATE_SEATS[2]).toBe(178);
    expect(territorial[1] + territorial[2] + FEHF_SENATE_SEATS[1] + FEHF_SENATE_SEATS[2]).toBe(348);
  });

  it("garde les Français établis hors de France hors des codes territoriaux", () => {
    expect(FEHF_SENATE_SEATS).toEqual({ 1: 6, 2: 6 });
    expect(SENATE_TERRITORIAL_CONSTITUENCIES.map(({ code }) => String(code)).includes("FEHF")).toBe(
      false
    );
  });

  it("couvre 107 circonscriptions territoriales sans doublon", () => {
    const codes = SENATE_TERRITORIAL_CONSTITUENCIES.map(({ code }) => code);
    expect(codes).toHaveLength(107);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("couvre les 63 circonscriptions territoriales renouvelées en 2026", () => {
    expect(SENATE_TERRITORIAL_CONSTITUENCIES.filter(({ series }) => series === 2)).toHaveLength(63);
  });

  it("conserve sièges et série sans aucun mandat, y compris pour un siège unique", () => {
    expect(getSenateTerritorialConstituency("04")).toEqual({ code: "04", series: 2, seats: 1 });
    expect(getSenateTerritorialConstituency("2A")).toEqual({ code: "2A", series: 2, seats: 1 });
    expect(getSenateTerritorialConstituency("13")).toEqual({ code: "13", series: 2, seats: 8 });
  });

  it("fixe Mayotte à deux sièges de série 1", () => {
    expect(getSenateTerritorialConstituency("976")).toEqual({
      code: "976",
      series: 1,
      seats: 2,
    });
  });

  it("ne comble pas une vraie absence du référentiel", () => {
    expect(getSenateTerritorialConstituency("984")).toBeUndefined();
  });
});
