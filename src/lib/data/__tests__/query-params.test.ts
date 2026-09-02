import { describe, it, expect } from "vitest";
import { parsePageParam, parseIntFilter } from "@/lib/data/query-params";

// Real payload lifted from the production scan of 2026-09-01.
const SQLI_PROBE = 'SENATORIALES") AND UPDATEXML(6619,CONCAT(0x2e),1)-- -';

describe("parsePageParam", () => {
  it("lit une page valide", () => {
    expect(parsePageParam("1")).toBe(1);
    expect(parsePageParam("7")).toBe(7);
    expect(parsePageParam("  7  ")).toBe(7);
  });

  it("retombe sur 1 quand le paramètre est absent", () => {
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam(null)).toBe(1);
    expect(parsePageParam("")).toBe(1);
  });

  it("retombe sur 1 sur une saisie non numérique", () => {
    // Le piège corrigé ici : Math.max(1, parseInt("abc", 10)) vaut NaN, pas 1.
    expect(Math.max(1, parseInt("abc", 10))).toBeNaN();
    expect(parsePageParam("abc")).toBe(1);
    expect(parsePageParam(SQLI_PROBE)).toBe(1);
    expect(parsePageParam("NaN")).toBe(1);
    expect(parsePageParam("Infinity")).toBe(1);
  });

  it("retombe sur 1 sur une page nulle ou négative", () => {
    expect(parsePageParam("0")).toBe(1);
    expect(parsePageParam("-4")).toBe(1);
  });

  it("prend la première valeur d'un paramètre répété", () => {
    expect(parsePageParam(["3", "abc"])).toBe(3);
    expect(parsePageParam(["abc", "3"])).toBe(1);
    expect(parsePageParam([])).toBe(1);
  });

  it("rend toujours un entier utilisable comme skip", () => {
    for (const raw of [undefined, "", "abc", "0", "-4", SQLI_PROBE, "2.9"]) {
      const page = parsePageParam(raw);
      expect(Number.isSafeInteger(page)).toBe(true);
      expect(page).toBeGreaterThanOrEqual(1);
      expect(Number.isSafeInteger((page - 1) * 20)).toBe(true);
    }
  });
});

describe("parseIntFilter", () => {
  it("lit un entier valide", () => {
    expect(parseIntFilter("17")).toBe(17);
    expect(parseIntFilter("0")).toBe(0);
    expect(parseIntFilter("-2")).toBe(-2);
  });

  it("rend undefined plutôt qu'un NaN qui ferait lever Prisma", () => {
    expect(parseIntFilter("abc")).toBeUndefined();
    expect(parseIntFilter(SQLI_PROBE)).toBeUndefined();
    expect(parseIntFilter("")).toBeUndefined();
    expect(parseIntFilter(undefined)).toBeUndefined();
    expect(parseIntFilter(null)).toBeUndefined();
  });
});
