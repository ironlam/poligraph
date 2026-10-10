import { describe, expect, it } from "vitest";
import { parisDay, parisMidnight } from "../dates";

describe("parisDay", () => {
  it("lit le jour calendaire à Paris, heure d'été et heure d'hiver", () => {
    expect(parisDay(new Date("2020-07-05T22:00:00Z"))).toBe("2020-07-06");
    expect(parisDay(new Date("2024-01-07T23:00:00Z"))).toBe("2024-01-08");
    expect(parisDay(new Date("2025-10-12T00:00:00Z"))).toBe("2025-10-12");
    expect(parisDay(new Date("2024-01-07T22:59:59Z"))).toBe("2024-01-07");
  });
});

describe("parisMidnight", () => {
  it("donne l'instant de minuit à Paris", () => {
    expect(parisMidnight("2020-07-06").toISOString()).toBe("2020-07-05T22:00:00.000Z");
    expect(parisMidnight("2024-01-08").toISOString()).toBe("2024-01-07T23:00:00.000Z");
  });

  it("aller-retour avec parisDay, y compris les jours de changement d'heure", () => {
    for (const day of ["2024-03-31", "2024-10-27", "2025-03-30", "2025-10-26", "2026-02-22"]) {
      expect(parisDay(parisMidnight(day))).toBe(day);
      expect(parisDay(new Date(parisMidnight(day).getTime() - 1))).not.toBe(day);
    }
  });
});
