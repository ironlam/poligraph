import { describe, expect, it } from "vitest";
import {
  communeCodeFromSegment,
  isCommuneSegment,
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

  // Régression : « œ » n'a pas de décomposition Unicode, le nom perdait ses voyelles
  // (« marcq-en-bar-ul-59378 »). 109 communes concernées, mesuré le 2026-11-17.
  it("écrit les ligatures œ et æ en toutes lettres", () => {
    expect(territoireCommunePath("59378", "Marcq-en-Barœul")).toBe(
      "/territoires/communes/marcq-en-baroeul-59378"
    );
    expect(territoireCommunePath("68099", "Frœningen")).toBe(
      "/territoires/communes/froeningen-68099"
    );
    expect(territoireCommunePath("14202", "Cricquebœuf")).toBe(
      "/territoires/communes/cricqueboeuf-14202"
    );
    expect(territoireCommunePath("00000", "Œuilly")).toBe("/territoires/communes/oeuilly-00000");
    expect(territoireCommunePath("00000", "Ærø")).toMatch(/^\/territoires\/communes\/aer/);
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

describe("isCommuneSegment", () => {
  it("accepte l'adresse lisible exacte et le code seul", () => {
    expect(isCommuneSegment("brest-29019", "29019", "Brest")).toBe(true);
    expect(isCommuneSegment("29019", "29019", "Brest")).toBe(true);
    expect(isCommuneSegment("saint-etienne-42218", "42218", "Saint-Étienne")).toBe(true);
    expect(isCommuneSegment("ajaccio-2A004", "2A004", "Ajaccio")).toBe(true);
  });

  it("refuse un nom qui n'est pas celui de la commune", () => {
    expect(isCommuneSegment("n-importe-quoi-29019", "29019", "Brest")).toBe(false);
    expect(isCommuneSegment("Brest-29019", "29019", "Brest")).toBe(false);
    expect(isCommuneSegment("brest--29019", "29019", "Brest")).toBe(false);
    expect(isCommuneSegment("saint-étienne-42218", "42218", "Saint-Étienne")).toBe(false);
    expect(isCommuneSegment("brest-29019", "35238", "Rennes")).toBe(false);
  });
});
