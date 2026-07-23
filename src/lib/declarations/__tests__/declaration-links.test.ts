import { describe, it, expect } from "vitest";
import { groupDeclarationLinks } from "@/lib/declarations/declaration-links";
import type { DeclarationInput } from "@/lib/declarations/declaration-links";

const d = (id: string, type: string, year: number): DeclarationInput => ({
  id,
  type,
  year,
  hatvpUrl: `https://hatvp/${id}`,
  pdfUrl: null,
});

describe("groupDeclarationLinks", () => {
  it("splits interets/patrimoine, sorts year desc, marks most-recent year", () => {
    const g = groupDeclarationLinks([
      d("a", "INTERETS", 2025),
      d("b", "INTERETS", 2026),
      d("c", "PATRIMOINE_MODIFICATION", 2026),
      d("e", "PATRIMOINE_DEBUT_MANDAT", 2025),
    ]);
    expect(g.interets.map((l) => l.year)).toEqual([2026, 2025]);
    expect(g.interets[0]!.isMostRecentYear).toBe(true);
    expect(g.interets[1]!.isMostRecentYear).toBe(false);
    expect(g.interets[0]!.label).toBe("Intérêts 2026");
    expect(g.patrimoine[0]!.label).toBe("Modification 2026");
  });

  it("deterministic type order at equal year (DEBUT < MODIF < FIN)", () => {
    const g = groupDeclarationLinks([
      d("x", "PATRIMOINE_FIN_MANDAT", 2025),
      d("y", "PATRIMOINE_DEBUT_MANDAT", 2025),
      d("z", "PATRIMOINE_MODIFICATION", 2025),
    ]);
    expect(g.patrimoine.map((l) => l.label)).toEqual([
      "Début mandat 2025",
      "Modification 2025",
      "Fin mandat 2025",
    ]);
  });

  it("marks all entries sharing the max year (no single-latest claim)", () => {
    const g = groupDeclarationLinks([d("a", "INTERETS", 2026), d("b", "INTERETS", 2026)]);
    expect(g.interets.every((l) => l.isMostRecentYear)).toBe(true);
  });

  it("uses pdfUrl when present, else hatvpUrl", () => {
    const g = groupDeclarationLinks([
      { id: "a", type: "INTERETS", year: 2026, hatvpUrl: "H", pdfUrl: "P" },
    ]);
    expect(g.interets[0]!.url).toBe("P");
  });
});
