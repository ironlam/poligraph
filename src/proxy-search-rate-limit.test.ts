import { describe, expect, it } from "vitest";
import { getRateLimitTier } from "@/proxy";

describe("quota de la recherche présidentielle", () => {
  it("laisse la page HTML accessible et limite son autocomplétion", () => {
    expect(getRateLimitTier("/elections/presidentielle-2027/recherche")).toBeNull();
    expect(getRateLimitTier("/api/elections/presidentielle-2027/recherche")).toBe("search");
  });

  it("conserve le quota général pour les autres routes publiques", () => {
    expect(getRateLimitTier("/api/elections/presidentielle-2027/candidats")).toBe("general");
  });
});
