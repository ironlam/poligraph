import { describe, expect, it } from "vitest";
import { getRateLimitTier } from "@/proxy";

describe("quota de la recherche présidentielle", () => {
  it("applique le quota recherche à la page hybride et à son autocomplétion", () => {
    expect(getRateLimitTier("/elections/presidentielle-2027/recherche")).toBe("search");
    expect(getRateLimitTier("/api/elections/presidentielle-2027/recherche")).toBe("search");
  });

  it("conserve le quota général pour les autres routes publiques", () => {
    expect(getRateLimitTier("/api/elections/presidentielle-2027/candidats")).toBe("general");
  });
});
