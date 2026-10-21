import { describe, expect, it } from "vitest";
import { sanitizePagePath } from "../page-path";

describe("sanitizePagePath", () => {
  it("garde un chemin interne", () => {
    expect(sanitizePagePath("/politiques/yael-braun-pivet")).toBe("/politiques/yael-braun-pivet");
  });

  it("retire les paramètres de requête et le fragment (une recherche peut nommer quelqu'un)", () => {
    expect(sanitizePagePath("/recherche?q=jean+dupont#haut")).toBe("/recherche");
  });

  it.each([
    "https://example.com/phishing",
    "//example.com",
    "javascript:alert(1)",
    "politiques/x",
    "/a b",
    "/a\\b",
    "/a\nb",
    "",
    "   ",
  ])("refuse %j", (input) => {
    expect(sanitizePagePath(input)).toBeNull();
  });

  it("refuse un chemin trop long et une valeur qui n'est pas une chaîne", () => {
    expect(sanitizePagePath(`/${"a".repeat(300)}`)).toBeNull();
    expect(sanitizePagePath(undefined)).toBeNull();
    expect(sanitizePagePath(42)).toBeNull();
  });
});
