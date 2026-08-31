import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { buildRateLimitExceededResponse, getRateLimitTier } from "@/proxy";

describe("quota de la recherche présidentielle", () => {
  it("applique le quota recherche à la page hybride et à son autocomplétion", () => {
    expect(getRateLimitTier("/elections/presidentielle-2027/recherche")).toBe("search");
    expect(getRateLimitTier("/api/elections/presidentielle-2027/recherche")).toBe("search");
  });

  it("réécrit une page limitée vers un état HTML sans exposer la réponse JSON de l'API", async () => {
    const reset = Date.now() + 30_000;
    const pageRequest = new NextRequest(
      "https://poligraph.fr/elections/presidentielle-2027/recherche?q=retraites"
    );
    const pageResponse = buildRateLimitExceededResponse(pageRequest, 30, reset);

    expect(pageResponse.status).toBe(429);
    expect(pageResponse.headers.get("content-type")).toBeNull();
    expect(pageResponse.headers.get("x-middleware-rewrite")).toBe(
      "https://poligraph.fr/elections/presidentielle-2027/recherche?q=retraites&limite=1"
    );

    const apiRequest = new NextRequest(
      "https://poligraph.fr/api/elections/presidentielle-2027/recherche?q=retraites"
    );
    const apiResponse = buildRateLimitExceededResponse(apiRequest, 30, reset);

    expect(apiResponse.status).toBe(429);
    expect(await apiResponse.json()).toEqual({ error: "Trop de requêtes. Réessayez plus tard." });
  });

  it("conserve le quota général pour les autres routes publiques", () => {
    expect(getRateLimitTier("/api/elections/presidentielle-2027/candidats")).toBe("general");
  });
});
