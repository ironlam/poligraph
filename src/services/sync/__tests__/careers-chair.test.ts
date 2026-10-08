import { describe, it, expect } from "vitest";
import { isCurrentChair } from "../careers-chair";

/**
 * A P488 claim without an end qualifier was taken as a current leadership, and
 * one without a start qualifier was dated "now". Measured on 2026-10-08: 12 of
 * 45 leader mandates started at the instant of their creation, among them
 * Valéry Giscard d'Estaing, dead in 2020, made leader of the Parti républicain,
 * dissolved in 1997, with his current party rewritten to match.
 */
describe("isCurrentChair", () => {
  const living = { politicianDeathDate: null, partyDissolvedDate: null };

  it("accepts a dated leadership of a living politician in an active party", () => {
    expect(isCurrentChair({ ...living, startDate: new Date("2008-11-23") })).toBe(true);
  });

  it("refuses a leadership without a start date rather than dating it today", () => {
    expect(isCurrentChair({ ...living, startDate: null })).toBe(false);
  });

  it("refuses a dissolved party", () => {
    expect(
      isCurrentChair({
        ...living,
        startDate: new Date("1977-05-20"),
        partyDissolvedDate: new Date("1997-06-24"),
      })
    ).toBe(false);
  });

  it("refuses a dead politician", () => {
    expect(
      isCurrentChair({
        ...living,
        startDate: new Date("1977-05-20"),
        politicianDeathDate: new Date("2020-12-02"),
      })
    ).toBe(false);
  });
});
