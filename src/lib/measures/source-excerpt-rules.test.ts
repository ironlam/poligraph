import { describe, expect, it } from "vitest";
import { validateExcerpt, EXCERPT_MAX_LENGTH, EXCERPT_MIN_LENGTH } from "./source-excerpt-rules";

const good =
  "Cette autorité sera indépendante, davantage dotée de moyens humains et financiers. Nous lui donnerons un pouvoir d’enquête renforcé sur les activités réellement réalisées par les anciens ministres et élus.";

describe("validateExcerpt", () => {
  it("accepte un passage de la bonne longueur qui finit une phrase", () => {
    const { excerpt, errors } = validateExcerpt(good);
    expect(errors).toEqual([]);
    expect(excerpt).toBe(good);
  });

  it("ramène les retours à la ligne du PDF à des espaces", () => {
    const { excerpt } = validateExcerpt(good.replace(/, /g, ",\n  "));
    expect(excerpt).toBe(good);
  });

  it("refuse un extrait trop court ou trop long", () => {
    expect(validateExcerpt("Trop court.").errors.join()).toMatch(/trop court/);
    expect(validateExcerpt("a".repeat(EXCERPT_MAX_LENGTH) + " fin.").errors.join()).toMatch(
      /trop long/
    );
    expect(good.length).toBeGreaterThan(EXCERPT_MIN_LENGTH);
  });

  it("refuse une note d'agent, un lien ou un texte coupé en cours de phrase", () => {
    expect(validateExcerpt(good + " (À vérifier avec la page 12.)").errors.join()).toMatch(/note/);
    expect(validateExcerpt(good + " https://exemple.fr.").errors.join()).toMatch(/lien/);
    expect(validateExcerpt(good.slice(0, -1) + ", et").errors.join()).toMatch(/fin d'une phrase/);
  });
});
