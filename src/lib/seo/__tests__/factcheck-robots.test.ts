import { describe, it, expect } from "vitest";
import {
  FACTCHECK_POLITICIAN_MIN_CLAIMS,
  FACTCHECK_RECORD_MIN_TOTAL,
  factCheckRobotsMetadata,
  hasAuthorContextBlock,
  hasClaimSpecificBlock,
  isIndexableFactCheck,
  isIndexableFactCheckPolitician,
  type FactCheckIndexSignals,
} from "../factcheck-robots";

const NO_BLOCK: FactCheckIndexSignals = {
  hasPublishedAuthor: true,
  authorFactCheckCount: 1,
  hasCandidacy: false,
  hasClaimDayVotes: false,
  hasThemeVotes: false,
};

describe("isIndexableFactCheck", () => {
  it("indexe un bloc propre à la déclaration accompagné d'un bilan", () => {
    expect(
      isIndexableFactCheck({ ...NO_BLOCK, hasClaimDayVotes: true, authorFactCheckCount: 5 })
    ).toBe(true);
    expect(
      isIndexableFactCheck({ ...NO_BLOCK, hasThemeVotes: true, authorFactCheckCount: 5 })
    ).toBe(true);
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
  it("indexe la page d'une personnalité à partir de trois déclarations", () => {
    expect(isIndexableFactCheckPolitician(FACTCHECK_POLITICIAN_MIN_CLAIMS)).toBe(true);
    expect(isIndexableFactCheckPolitician(FACTCHECK_POLITICIAN_MIN_CLAIMS - 1)).toBe(false);
    expect(FACTCHECK_POLITICIAN_MIN_CLAIMS).toBe(3);
  });
});
