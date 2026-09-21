import { describe, it, expect } from "vitest";
import {
  classifyCandidacyCoverage,
  needsWebResearch,
  type CandidacyCoverageInput,
} from "../coverage-audit";

/**
 * A candidacy with nothing missing. Every case below starts from this and breaks one thing, so a
 * test names the defect it introduces rather than restating a whole row.
 */
const COMPLETE: CandidacyCoverageInput = {
  candidateName: "Candidate Complète",
  politicianSlug: "candidate-complete",
  measureCount: 40,
  programEditionCount: 1,
  publishedProgramEditionCount: 1,
  synthesis: "Une synthèse.",
  synthesisGeneratedAt: new Date("2026-09-10T00:00:00.000Z"),
  firstMeasurePublishedAt: new Date("2026-09-01T00:00:00.000Z"),
  themes: [
    { theme: "ECONOMIE_BUDGET", state: "PUBLISHED" },
    { theme: "SANTE", state: "PUBLISHED" },
  ],
  storedThemeSyntheses: [
    { theme: "ECONOMIE_BUDGET", promptVersion: "candidacy-theme-synthesis-v4" },
    { theme: "SANTE", promptVersion: "candidacy-theme-synthesis-v4" },
  ],
};

function kinds(input: CandidacyCoverageInput): string[] {
  return classifyCandidacyCoverage(input).findings.map((finding) => finding.kind);
}

describe("classifyCandidacyCoverage", () => {
  it("ne signale rien sur une candidature complète", () => {
    expect(kinds(COMPLETE)).toEqual([]);
  });

  it("signale une candidature déclarée sans aucune mesure", () => {
    const result = kinds({
      ...COMPLETE,
      measureCount: 0,
      firstMeasurePublishedAt: null,
      themes: [],
      storedThemeSyntheses: [],
    });
    expect(result).toEqual(["AUCUNE_MESURE"]);
  });

  it("signale des mesures publiées sans édition de programme rattachée", () => {
    expect(kinds({ ...COMPLETE, programEditionCount: 0, publishedProgramEditionCount: 0 })).toEqual(
      ["PROGRAMME_ABSENT"]
    );
  });

  // A registered but unpublished edition is a different problem from a missing one: the document
  // has been found, so no amount of web research adds anything.
  it("ne réclame pas de programme quand une édition existe en brouillon", () => {
    expect(
      kinds({ ...COMPLETE, programEditionCount: 1, publishedProgramEditionCount: 0 })
    ).not.toContain("PROGRAMME_ABSENT");
  });

  it("ne réclame pas de programme pour une candidature sans mesure", () => {
    const result = kinds({
      ...COMPLETE,
      measureCount: 0,
      programEditionCount: 0,
      publishedProgramEditionCount: 0,
      firstMeasurePublishedAt: null,
      themes: [],
      storedThemeSyntheses: [],
    });
    expect(result).toEqual(["AUCUNE_MESURE"]);
  });

  it("signale une synthèse absente", () => {
    expect(kinds({ ...COMPLETE, synthesis: null, synthesisGeneratedAt: null })).toEqual([
      "SYNTHESE_ABSENTE",
    ]);
  });

  // The authority is `isSynthesisContradictedByMeasures`: a text older than the oldest measure the
  // fiche shows describes a programme that did not exist when it was written.
  it("signale une synthèse démentie par des mesures plus récentes", () => {
    expect(
      kinds({
        ...COMPLETE,
        synthesisGeneratedAt: new Date("2026-08-01T00:00:00.000Z"),
        firstMeasurePublishedAt: new Date("2026-09-01T00:00:00.000Z"),
      })
    ).toEqual(["SYNTHESE_DEMENTIE"]);
  });

  it("signale une synthèse non datée dès qu'une mesure existe", () => {
    expect(kinds({ ...COMPLETE, synthesisGeneratedAt: null })).toEqual(["SYNTHESE_DEMENTIE"]);
  });

  it("traduit chaque état de synthèse thématique en un constat", () => {
    const result = classifyCandidacyCoverage({
      ...COMPLETE,
      themes: [
        { theme: "ECONOMIE_BUDGET", state: "MISSING" },
        { theme: "SANTE", state: "OBSOLETE" },
        { theme: "SECURITE_JUSTICE", state: "PENDING_REVIEW" },
        { theme: "EDUCATION_CULTURE", state: "PUBLISHED" },
      ],
    });
    expect(result.findings.map((f) => f.kind)).toEqual([
      "THEME_SYNTHESE_MANQUANTE",
      "THEME_SYNTHESE_OBSOLETE",
      "THEME_SYNTHESE_EN_ATTENTE",
    ]);
    expect(result.findings.map((f) => f.themes)).toEqual([
      ["ECONOMIE_BUDGET"],
      ["SANTE"],
      ["SECURITE_JUSTICE"],
    ]);
  });

  it("regroupe les thèmes de même état en un seul constat", () => {
    const result = classifyCandidacyCoverage({
      ...COMPLETE,
      themes: [
        { theme: "ECONOMIE_BUDGET", state: "MISSING" },
        { theme: "SANTE", state: "MISSING" },
      ],
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.themes).toEqual(["ECONOMIE_BUDGET", "SANTE"]);
  });

  /**
   * SOCIAL_TRAVAIL is in the Prisma enum but deliberately out of the presidential catalogue
   * (`THEMES_IN_ORDER`), so no hub surface ever renders it. Counting it would invent a synthesis
   * nobody can publish and no reader would ever see.
   */
  it("ignore un thème absent du catalogue présidentiel", () => {
    const result = classifyCandidacyCoverage({
      ...COMPLETE,
      themes: [
        { theme: "SOCIAL_TRAVAIL", state: "MISSING" },
        { theme: "ECONOMIE_BUDGET", state: "MISSING" },
      ],
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.themes).toEqual(["ECONOMIE_BUDGET"]);
  });

  it("ne produit aucun constat quand seuls des thèmes hors catalogue manquent", () => {
    const result = classifyCandidacyCoverage({
      ...COMPLETE,
      themes: [{ theme: "SOCIAL_TRAVAIL", state: "MISSING" }],
    });
    expect(result.findings).toEqual([]);
  });

  /**
   * The regression this file exists for.
   *
   * Stored prompt versions are composite editorial labels ("...-v4-editorial-v2"), not the plain
   * constant. Comparing them by equality lit up 29 of 31 production candidacies as stale while the
   * corpus fingerprints all matched. Staleness has exactly one authority, the fingerprint, and it
   * reaches this function already resolved as a theme state.
   */
  it("ne déduit AUCUNE péremption d'une version de prompt différente", () => {
    const result = classifyCandidacyCoverage({
      ...COMPLETE,
      storedThemeSyntheses: [
        { theme: "ECONOMIE_BUDGET", promptVersion: "candidacy-theme-synthesis-v3-editorial-v1" },
        { theme: "SANTE", promptVersion: "candidacy-theme-synthesis-v4-editorial-v2" },
      ],
    });
    expect(result.findings).toEqual([]);
  });

  it("rapporte les lignées de prompt comme un décompte, hors constats", () => {
    const result = classifyCandidacyCoverage({
      ...COMPLETE,
      storedThemeSyntheses: [
        { theme: "ECONOMIE_BUDGET", promptVersion: "candidacy-theme-synthesis-v3-editorial-v1" },
        { theme: "SANTE", promptVersion: "candidacy-theme-synthesis-v3-editorial-v1" },
      ],
    });
    expect(result.promptLineage).toEqual({ "candidacy-theme-synthesis-v3-editorial-v1": 2 });
  });

  it("cumule les constats de plusieurs axes sur une même candidature", () => {
    const result = kinds({
      ...COMPLETE,
      programEditionCount: 0,
      publishedProgramEditionCount: 0,
      synthesis: null,
      synthesisGeneratedAt: null,
      themes: [{ theme: "ECONOMIE_BUDGET", state: "MISSING" }],
    });
    expect(result).toEqual(["PROGRAMME_ABSENT", "SYNTHESE_ABSENTE", "THEME_SYNTHESE_MANQUANTE"]);
  });
});

describe("needsWebResearch", () => {
  // The whole point of the split: three of the four axes answer from the database alone, so the
  // command must not spend a search on them.
  it("ne vaut que pour les axes que la base ne peut pas trancher", () => {
    expect(needsWebResearch("PROGRAMME_ABSENT")).toBe(true);
    expect(needsWebResearch("AUCUNE_MESURE")).toBe(true);
    expect(needsWebResearch("SYNTHESE_ABSENTE")).toBe(false);
    expect(needsWebResearch("SYNTHESE_DEMENTIE")).toBe(false);
    expect(needsWebResearch("THEME_SYNTHESE_MANQUANTE")).toBe(false);
    expect(needsWebResearch("THEME_SYNTHESE_OBSOLETE")).toBe(false);
    expect(needsWebResearch("THEME_SYNTHESE_EN_ATTENTE")).toBe(false);
  });

  it("marque une candidature comme cible de recherche dès qu'un constat l'exige", () => {
    const withProgramme = classifyCandidacyCoverage({
      ...COMPLETE,
      programEditionCount: 0,
      publishedProgramEditionCount: 0,
    });
    expect(withProgramme.webResearchWorthwhile).toBe(true);

    const synthesisOnly = classifyCandidacyCoverage({ ...COMPLETE, synthesis: null });
    expect(synthesisOnly.findings).not.toHaveLength(0);
    expect(synthesisOnly.webResearchWorthwhile).toBe(false);
  });
});
