import { describe, expect, it } from "vitest";
import { buildMeasureSlug, MAX_MEASURE_SLUG_LENGTH } from "../slug";

describe("buildMeasureSlug", () => {
  it("associe la personnalité à une formulation lisible", () => {
    expect(buildMeasureSlug("gabriel-attal", "Créer 500 000 logements supplémentaires")).toBe(
      "gabriel-attal-creer-500-000-logements-supplementaires"
    );
  });

  it("coupe les formulations longues entre deux mots", () => {
    const slug = buildMeasureSlug("gabriel-attal", "logements supplémentaires ".repeat(20));
    expect(slug.length).toBeLessThanOrEqual(MAX_MEASURE_SLUG_LENGTH);
    expect(slug.endsWith("-")).toBe(false);
  });
});
