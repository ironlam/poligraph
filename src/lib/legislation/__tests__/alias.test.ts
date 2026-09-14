import { describe, expect, it } from "vitest";
import { normalizeDossierAlias } from "../alias";

describe("normalizeDossierAlias", () => {
  it.each([
    ["Loi Duplomb", "duplomb"],
    [" loi-duplomb ", "duplomb"],
    ["LOI YADAN", "yadan"],
    ["Loi d'orientation agricole", "d orientation agricole"],
  ])("normalise %s", (input, expected) => {
    expect(normalizeDossierAlias(input)).toBe(expected);
  });
});
