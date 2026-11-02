import { describe, it, expect } from "vitest";
import { scrutinSequence, compareScrutinsRecentFirst } from "../scrutin-order";

describe("scrutinSequence", () => {
  it("lit le numéro final d'un scrutin de l'Assemblée", () => {
    expect(scrutinSequence("VTANR5L17V9097")).toBe(9097);
    expect(scrutinSequence("VTANR5L17V12")).toBe(12);
  });

  it("lit le numéro final d'un scrutin du Sénat", () => {
    expect(scrutinSequence("SENAT-2024-330")).toBe(330);
  });

  it("renvoie 0 sans numéro final", () => {
    expect(scrutinSequence("sans-numero")).toBe(0);
  });
});

describe("compareScrutinsRecentFirst", () => {
  const day = new Date("2026-10-23T00:00:00.000Z");
  const nextDay = new Date("2026-10-24T00:00:00.000Z");

  it("place le jour le plus récent en premier", () => {
    const rows = [
      { id: "a", votingDate: day, sequence: 9999 },
      { id: "b", votingDate: nextDay, sequence: 1 },
    ];
    expect(rows.sort(compareScrutinsRecentFirst).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("départage un même jour par numéro décroissant", () => {
    const rows = ["VTANR5L17V9086", "VTANR5L17V9097", "VTANR5L17V9089"].map((externalId) => ({
      id: externalId,
      votingDate: day,
      sequence: scrutinSequence(externalId),
    }));
    expect(rows.sort(compareScrutinsRecentFirst).map((r) => r.id)).toEqual([
      "VTANR5L17V9097",
      "VTANR5L17V9089",
      "VTANR5L17V9086",
    ]);
  });

  it("compare les numéros comme des nombres, pas comme du texte", () => {
    const rows = ["VTANR5L17V9999", "VTANR5L17V10000"].map((externalId) => ({
      id: externalId,
      votingDate: day,
      sequence: scrutinSequence(externalId),
    }));
    expect(rows.sort(compareScrutinsRecentFirst).map((r) => r.id)).toEqual([
      "VTANR5L17V10000",
      "VTANR5L17V9999",
    ]);
  });

  it("accepte une date sérialisée en chaîne", () => {
    const rows = [
      { id: "a", votingDate: "2026-10-23T00:00:00.000Z", sequence: 5 },
      { id: "b", votingDate: "2026-10-23T00:00:00.000Z", sequence: 7 },
    ];
    expect(rows.sort(compareScrutinsRecentFirst).map((r) => r.id)).toEqual(["b", "a"]);
  });
});
