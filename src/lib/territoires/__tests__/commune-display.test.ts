import { describe, expect, it } from "vitest";
import {
  communeTitle,
  formatCirconscription,
  formatPct,
  formatPopulation,
  deputeNoun,
} from "../commune-display";
import { dossier, papeete, withMaire } from "@/app/territoires/communes/[code]/__tests__/fixtures";

describe("commune-display", () => {
  it("accorde l'ordinal de la circonscription", () => {
    expect(formatCirconscription(1)).toBe("1re circonscription");
    expect(formatCirconscription(3)).toBe("3e circonscription");
  });

  it("groupe les milliers avec une espace insécable que la police dessine", () => {
    expect(formatPopulation(230890)).toBe("230 890 habitants");
    expect(formatPopulation(1)).toBe("1 habitant");
    expect(formatPct(54.2)).toBe("54,2 %");
    expect(formatPct(1234.5)).toBe("1 234,5 %");
  });

  it("accorde la fonction à la civilité, sans deviner", () => {
    expect(deputeNoun("Mme")).toBe("députée");
    expect(deputeNoun("M.")).toBe("député");
    expect(deputeNoun(null)).toBeNull();
  });

  it("adapte le titre nominatif aux faits établis", () => {
    expect(communeTitle(dossier())).toBe("Rennes (35) : maire, élus et résultats");
    expect(communeTitle(withMaire("ABSENT"))).toBe("Rennes (35) : élus et résultats");
    expect(communeTitle(papeete())).toBe("Papeete (987) : élus et informations publiques");
  });
});
