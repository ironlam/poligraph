import { describe, expect, it } from "vitest";
import {
  communeCodeFromSegment,
  legacyCommunePath,
  territoireCommuneDecisionsPath,
  territoireCommuneElectionsPath,
  territoireCommunePath,
} from "@/lib/territoires/paths";

describe("territoireCommunePath", () => {
  it("écrit le nom devant le code, sans accent ni espace", () => {
    expect(territoireCommunePath("29019", "Brest")).toBe("/territoires/communes/brest-29019");
    expect(territoireCommunePath("2A004", "Ajaccio")).toBe("/territoires/communes/ajaccio-2A004");
    expect(territoireCommunePath("13055", "Marseille")).toBe(
      "/territoires/communes/marseille-13055"
    );
    expect(territoireCommunePath("51454", "Reims")).toBe("/territoires/communes/reims-51454");
    expect(territoireCommunePath("42218", "Saint-Étienne")).toBe(
      "/territoires/communes/saint-etienne-42218"
    );
    expect(territoireCommunePath("76351", "Le Havre")).toBe("/territoires/communes/le-havre-76351");
    expect(territoireCommunePath("80021", "L'Étoile")).toBe("/territoires/communes/l-etoile-80021");
  });

  it("rend le code seul sans nom : l'adresse répond encore, par redirection", () => {
    expect(territoireCommunePath("29019")).toBe("/territoires/communes/29019");
    expect(territoireCommunePath("29019", null)).toBe("/territoires/communes/29019");
    expect(territoireCommunePath("29019", "'")).toBe("/territoires/communes/29019");
  });

  it("porte le nom jusqu'aux sous-pages", () => {
    expect(territoireCommuneElectionsPath("29019", "Brest")).toBe(
      "/territoires/communes/brest-29019/elections"
    );
    expect(territoireCommuneDecisionsPath("29019", "Brest")).toBe(
      "/territoires/communes/brest-29019/decisions"
    );
  });
});

describe("communeCodeFromSegment", () => {
  it("lit le code à la fin du segment, lisible ou nu", () => {
    expect(communeCodeFromSegment("brest-29019")).toBe("29019");
    expect(communeCodeFromSegment("29019")).toBe("29019");
    expect(communeCodeFromSegment("ajaccio-2A004")).toBe("2A004");
    expect(communeCodeFromSegment("saint-etienne-42218")).toBe("42218");
  });

  it("ne se fie jamais au nom : un nom faux mène quand même à la bonne commune", () => {
    expect(communeCodeFromSegment("n-importe-quoi-29019")).toBe("29019");
  });

  it("refuse un segment sans code valide", () => {
    expect(communeCodeFromSegment("brest")).toBeNull();
    expect(communeCodeFromSegment("brest-2901")).toBeNull();
    expect(communeCodeFromSegment("brest29019")).toBeNull();
    expect(communeCodeFromSegment("brest-290199")).toBeNull();
    expect(communeCodeFromSegment("")).toBeNull();
  });
});

describe("legacyCommunePath", () => {
  it("reconnaît l'ancienne adresse et sa sous-page", () => {
    expect(legacyCommunePath("/territoires/communes/29019")).toEqual({ code: "29019", suite: "" });
    expect(legacyCommunePath("/territoires/communes/2B033/elections")).toEqual({
      code: "2B033",
      suite: "/elections",
    });
    expect(legacyCommunePath("/territoires/communes/29019/decisions")).toEqual({
      code: "29019",
      suite: "/decisions",
    });
  });

  it("laisse passer l'adresse lisible et tout le reste", () => {
    expect(legacyCommunePath("/territoires/communes/brest-29019")).toBeNull();
    expect(legacyCommunePath("/territoires/communes/brest-29019/elections")).toBeNull();
    expect(legacyCommunePath("/territoires/communes/29019/opengraph-image")).toBeNull();
    expect(legacyCommunePath("/territoires/communes/29019/autre")).toBeNull();
    expect(legacyCommunePath("/api/v1/territoires/communes/29019")).toBeNull();
    expect(legacyCommunePath("/territoires/communes/2901")).toBeNull();
  });
});
