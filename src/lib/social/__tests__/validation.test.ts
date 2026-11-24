import { afterEach, describe, expect, it, vi } from "vitest";
import { validateBlueskyText, validateXText, xWeightedLength } from "../validation";

describe("validateXText", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts a plain post under the limit", () => {
    expect(validateXText("Le vote de la semaine : 312 pour, 201 contre.")).toEqual([]);
  });

  it("refuses links, bare domains included, unless allowed", () => {
    expect(validateXText("Tout est sur https://poligraph.fr/votes")).toHaveLength(1);
    expect(validateXText("Tout est sur poligraph.fr")).toHaveLength(1);
    expect(validateXText("Tout est sur poligraph.fr", { allowLink: true })).toEqual([]);
  });

  it("does not take a decimal number for a domain", () => {
    expect(validateXText("Le déficit atteint 5.4 % du PIB.")).toEqual([]);
  });

  it("counts emoji double and follows SOCIAL_X_MAX_CHARS", () => {
    expect(xWeightedLength("ab🗳️")).toBeGreaterThanOrEqual(4);
    expect(validateXText("a".repeat(281))).toHaveLength(1);
    vi.stubEnv("SOCIAL_X_MAX_CHARS", "4000");
    expect(validateXText("a".repeat(281))).toEqual([]);
  });

  it("refuses an empty text", () => {
    expect(validateXText("   ")).toEqual(["Texte X vide."]);
  });
});

describe("validateBlueskyText", () => {
  it("counts graphemes, not UTF-16 units", () => {
    expect(validateBlueskyText("é".repeat(300))).toEqual([]);
    expect(validateBlueskyText("é".repeat(301))).toHaveLength(1);
  });
});
