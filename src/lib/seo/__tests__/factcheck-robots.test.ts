import { describe, it, expect } from "vitest";
import {
  FACTCHECK_POLITICIAN_MIN_CLAIMS,
  FACTCHECK_RECORD_MIN_TOTAL,
  factCheckRobotsMetadata,
  hasAuthorContextBlock,
  hasClaimSpecificBlock,
  isIndexableFactCheck,
  filteredPoliticianViewMetadata,
  isIndexableFactCheckPolitician,
  type FactCheckIndexSignals,
} from "../factcheck-robots";

const NO_BLOCK: FactCheckIndexSignals = {
  hasPublishedAuthor: true,
  authorFactCheckCount: 1,
  hasCandidacy: false,
  hasClaimDayVotes: false,
  hasThemeVotes: false,
  hasThemeProgramme: false,
};

describe("isIndexableFactCheck", () => {
  it("indexe un bloc propre à la déclaration accompagné d'un bilan", () => {
    expect(
      isIndexableFactCheck({ ...NO_BLOCK, hasClaimDayVotes: true, authorFactCheckCount: 5 })
    ).toBe(true);
    expect(
      isIndexableFactCheck({
        ...NO_BLOCK,
        hasThemeVotes: true,
        hasThemeProgramme: true,
        authorFactCheckCount: 5,
      })
    ).toBe(true);
  });

  it("indexe le programme du thème avec un bilan ou une candidature, sans vote", () => {
    const signals = { ...NO_BLOCK, hasThemeProgramme: true };
    expect(hasClaimSpecificBlock(signals)).toBe(true);
    expect(isIndexableFactCheck(signals)).toBe(false);
    expect(isIndexableFactCheck({ ...signals, authorFactCheckCount: 2 })).toBe(true);
    expect(isIndexableFactCheck({ ...signals, hasCandidacy: true })).toBe(true);
    expect(
      isIndexableFactCheck({ ...signals, hasCandidacy: true, hasPublishedAuthor: false })
    ).toBe(false);
  });

  it("accepte la candidature 2027 comme contexte de l'auteur", () => {
    expect(isIndexableFactCheck({ ...NO_BLOCK, hasClaimDayVotes: true, hasCandidacy: true })).toBe(
      true
    );
  });

  it("n'indexe pas un auteur bien situé sans bloc propre à la déclaration", () => {
    // Record and candidacy are the same on every page of this author: they cannot tell two
    // sibling pages apart (review of 2026-11-22).
    expect(
      isIndexableFactCheck({ ...NO_BLOCK, authorFactCheckCount: 40, hasCandidacy: true })
    ).toBe(false);
  });

  it("n'indexe pas un bloc propre à la déclaration sans contexte sur l'auteur", () => {
    const signals = { ...NO_BLOCK, hasClaimDayVotes: true, authorFactCheckCount: 1 };
    expect(hasClaimSpecificBlock(signals)).toBe(true);
    expect(hasAuthorContextBlock(signals)).toBe(false);
    expect(isIndexableFactCheck(signals)).toBe(false);
    expect(
      isIndexableFactCheck({ ...signals, authorFactCheckCount: FACTCHECK_RECORD_MIN_TOTAL })
    ).toBe(true);
  });

  it("n'indexe jamais sans auteur publié, quels que soient les autres signaux", () => {
    expect(
      isIndexableFactCheck({
        hasPublishedAuthor: false,
        authorFactCheckCount: 10,
        hasCandidacy: true,
        hasClaimDayVotes: true,
        hasThemeVotes: true,
        hasThemeProgramme: true,
      })
    ).toBe(false);
  });
});

describe("factCheckRobotsMetadata", () => {
  it("hérite de l'indexation par défaut pour une page indexable", () => {
    expect(factCheckRobotsMetadata(true)).toEqual({});
  });

  it("sort de l'index sans bloquer les liens", () => {
    expect(factCheckRobotsMetadata(false)).toEqual({ robots: { index: false, follow: true } });
  });
});

describe("isIndexableFactCheckPolitician", () => {
  it("indexe la page d'une personnalité à partir de trois fact-checks rassemblés", () => {
    expect(FACTCHECK_POLITICIAN_MIN_CLAIMS).toBe(3);
    expect(isIndexableFactCheckPolitician({ claimed: 3, aboutConfirmed: 0 })).toBe(true);
    expect(isIndexableFactCheckPolitician({ claimed: 2, aboutConfirmed: 0 })).toBe(false);
  });

  it("compte les vérifications à son sujet comme ses déclarations", () => {
    expect(isIndexableFactCheckPolitician({ claimed: 0, aboutConfirmed: 3 })).toBe(true);
    expect(isIndexableFactCheckPolitician({ claimed: 1, aboutConfirmed: 2 })).toBe(true);
    expect(isIndexableFactCheckPolitician({ claimed: 1, aboutConfirmed: 1 })).toBe(false);
  });
});

describe("filteredPoliticianViewMetadata", () => {
  it("sort la vue filtrée de l'index et pointe son canonical vers la landing", () => {
    const meta = filteredPoliticianViewMetadata(
      "Jean-Luc Mélenchon",
      "/factchecks/politique/jean-luc-melenchon"
    );
    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(meta.alternates).toEqual({ canonical: "/factchecks/politique/jean-luc-melenchon" });
  });

  it("pointe vers la liste nue quand la personne n'a pas de landing", () => {
    const meta = filteredPoliticianViewMetadata("Camille Rivière", null);
    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(meta.alternates).toEqual({ canonical: "/factchecks" });
  });

  it("ne parle pas seulement de déclarations : la vue liste aussi les rumeurs", () => {
    const meta = filteredPoliticianViewMetadata("Camille Rivière", null);
    expect(meta.description).toContain("qui citent Camille Rivière");
    expect(meta.description).not.toMatch(/^Vérifications des déclarations/);
  });
});
