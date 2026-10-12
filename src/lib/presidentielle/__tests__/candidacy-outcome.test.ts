import { describe, expect, it } from "vitest";
import { isPrimaryDefeat } from "../candidacy-outcome";

describe("isPrimaryDefeat", () => {
  it("reconnaît le marqueur canonique et les libellés éditoriaux existants", () => {
    expect(isPrimaryDefeat("RETIRE", " Défaite à la primaire ")).toBe(true);
    expect(isPrimaryDefeat("RETIRE", "battu à la primaire")).toBe(true);
    expect(isPrimaryDefeat("RETIRE", "battue à la primaire")).toBe(true);
  });

  it("ne déduit pas une défaite du seul statut ni d'une autre raison", () => {
    expect(isPrimaryDefeat("RETIRE", null)).toBe(false);
    expect(isPrimaryDefeat("RETIRE", "Retrait personnel")).toBe(false);
    expect(isPrimaryDefeat("DECLARE", "Défaite à la primaire")).toBe(false);
  });
});
