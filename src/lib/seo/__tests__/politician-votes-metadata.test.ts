import { describe, it, expect } from "vitest";
import {
  resolveVoteCorpusChamber,
  buildPoliticianVotesSeo,
  buildPoliticianVotesIntro,
} from "@/lib/seo/politician-votes-metadata";

describe("resolveVoteCorpusChamber", () => {
  it("resolves an AN-only corpus", () => {
    expect(resolveVoteCorpusChamber(["AN"])).toBe("AN");
  });

  it("resolves a Sénat-only corpus", () => {
    expect(resolveVoteCorpusChamber(["SENAT"])).toBe("SENAT");
  });

  it("returns null for a mixed corpus", () => {
    expect(resolveVoteCorpusChamber(["AN", "SENAT"])).toBeNull();
  });

  it("returns null for an empty corpus", () => {
    expect(resolveVoteCorpusChamber([])).toBeNull();
  });
});

describe("buildPoliticianVotesSeo", () => {
  it("targets the Assemblée nationale for a deputy", () => {
    const seo = buildPoliticianVotesSeo("Jean Dupont", "AN");
    expect(seo.title).toBe("Votes de Jean Dupont à l'Assemblée nationale");
    expect(seo.description).toBe(
      "Consultez les votes parlementaires de Jean Dupont à l'Assemblée nationale : textes de loi, amendements et positions enregistrées."
    );
    expect(seo.heading).toBe("Votes de Jean Dupont à l'Assemblée nationale");
  });

  it("targets the Sénat for a senator and never says Assemblée nationale", () => {
    const seo = buildPoliticianVotesSeo("Marie Martin", "SENAT");
    expect(seo.title).toBe("Votes de Marie Martin au Sénat");
    expect(seo.description).toBe(
      "Consultez les votes parlementaires de Marie Martin au Sénat : textes de loi, amendements et positions enregistrées."
    );
    expect(seo.heading).toBe("Votes de Marie Martin au Sénat");
    expect(seo.title).not.toContain("Assemblée nationale");
    expect(seo.description).not.toContain("Assemblée nationale");
  });

  it("falls back to a chamber-free wording when the chamber is unknown", () => {
    const seo = buildPoliticianVotesSeo("Camille Durand", null);
    expect(seo.title).toBe("Votes parlementaires de Camille Durand");
    expect(seo.description).toBe(
      "Consultez les votes parlementaires enregistrés pour Camille Durand : textes de loi, amendements et positions enregistrées."
    );
    expect(seo.heading).toBe("Votes parlementaires de Camille Durand");
    for (const value of [seo.title, seo.description, seo.heading]) {
      expect(value).not.toContain("Assemblée nationale");
      expect(value).not.toContain("Sénat");
    }
  });
});

describe("buildPoliticianVotesIntro", () => {
  it("states the recorded volume and the chamber", () => {
    expect(
      buildPoliticianVotesIntro({
        fullName: "Jean Dupont",
        chamber: "AN",
        totalVotes: 204,
        amendmentVotes: 112,
      })
    ).toBe(
      "Au total, 204 votes de Jean Dupont sont enregistrés à l'Assemblée nationale. 112 portent sur des amendements."
    );
  });

  it("omits the chamber when it is unknown", () => {
    const intro = buildPoliticianVotesIntro({
      fullName: "Camille Durand",
      chamber: null,
      totalVotes: 3,
      amendmentVotes: 0,
    });
    expect(intro).toBe("Au total, 3 votes de Camille Durand sont enregistrés.");
    expect(intro).not.toContain("Assemblée nationale");
    expect(intro).not.toContain("Sénat");
  });

  it("uses a neutral fallback when no vote is recorded", () => {
    expect(
      buildPoliticianVotesIntro({
        fullName: "Camille Durand",
        chamber: "AN",
        totalVotes: 0,
        amendmentVotes: 0,
      })
    ).toBe("Aucun vote parlementaire n'est enregistré pour Camille Durand.");
  });

  it("carries no participation claim (issue #717)", () => {
    const intro = buildPoliticianVotesIntro({
      fullName: "Jean Dupont",
      chamber: "AN",
      totalVotes: 100,
      amendmentVotes: 20,
    });
    expect(intro?.toLowerCase()).not.toContain("participation");
    expect(intro).not.toContain("%");
  });
});

describe("buildPoliticianVotesIntro limité à une législature", () => {
  const scopeLabel = "17ᵉ législature (depuis 2024)";

  it("annonce la législature au lieu d'un total de carrière", () => {
    const intro = buildPoliticianVotesIntro({
      fullName: "Camille Durand",
      chamber: "AN",
      totalVotes: 1200,
      amendmentVotes: 900,
      scopeLabel,
    });

    // toLocaleString("fr-FR") sépare les milliers par une espace insécable fine.
    expect(intro?.replace(/[\u202f\u00a0]/g, " ")).toBe(
      "Pour la 17ᵉ législature (depuis 2024), 1 200 votes de Camille Durand sont enregistrés à l'Assemblée nationale. 900 portent sur des amendements."
    );
  });

  it("dit qu'aucun vote n'est enregistré pour cette législature, pas pour la carrière", () => {
    expect(
      buildPoliticianVotesIntro({
        fullName: "Camille Durand",
        chamber: "AN",
        totalVotes: 0,
        amendmentVotes: 0,
        scopeLabel,
      })
    ).toBe("Aucun vote de Camille Durand n'est enregistré pour la 17ᵉ législature (depuis 2024).");
  });

  it("garde la phrase de carrière sans législature", () => {
    expect(
      buildPoliticianVotesIntro({
        fullName: "Camille Durand",
        chamber: "AN",
        totalVotes: 4,
        amendmentVotes: 0,
      })
    ).toBe("Au total, 4 votes de Camille Durand sont enregistrés à l'Assemblée nationale.");
  });
});
