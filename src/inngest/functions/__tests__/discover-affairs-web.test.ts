import { describe, it, expect } from "vitest";
import { remainingWaveSize } from "../discover-affairs-web";

describe("remainingWaveSize", () => {
  it("sert une vague pleine en début de mois", () => {
    expect(remainingWaveSize(0, 250, 1000)).toBe(250);
  });

  it("rabote la dernière vague sur ce qui reste de l'enveloppe", () => {
    // Un mois à cinq lundis dépasserait de 250 requêtes sans cette borne.
    expect(remainingWaveSize(900, 250, 1000)).toBe(100);
  });

  it("ne sert rien quand l'enveloppe est épuisée", () => {
    expect(remainingWaveSize(1000, 250, 1000)).toBe(0);
  });

  it("ne renvoie jamais de négatif si le mois a déjà débordé", () => {
    // Une passe manuelle peut avoir dépensé au-delà du plafond.
    expect(remainingWaveSize(1300, 250, 1000)).toBe(0);
  });
});
