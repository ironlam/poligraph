import { describe, expect, it } from "vitest";
import { parseFrenchPct } from "../parse-wide-results-2026";

describe("parseFrenchPct", () => {
  it("lit un pourcentage français", () => {
    expect(parseFrenchPct("55,08%")).toBe(55.08);
    expect(parseFrenchPct("100,00%")).toBe(100);
  });

  it("rend 0 sur une cellule vide", () => {
    expect(parseFrenchPct("")).toBe(0);
    expect(parseFrenchPct("   ")).toBe(0);
  });

  /**
   * `replace("%", "")` ne retirait que la première occurrence. Sur une cellule doublement
   * préfixée, le `%` restant ouvrait la chaîne, `parseFloat` rendait NaN et le `|| 0` le
   * transformait en zéro : un taux de participation nul, sans erreur ni trace.
   *
   * Cas non observé dans les fichiers reçus, mais le mode de défaillance est muet, donc le
   * constater coûte moins cher que le découvrir sur une page publiée.
   */
  it("retire tous les signes pourcent, pas seulement le premier", () => {
    expect(parseFrenchPct("%%55,08")).toBe(55.08);
    expect(parseFrenchPct("55,08%%")).toBe(55.08);
  });
});
