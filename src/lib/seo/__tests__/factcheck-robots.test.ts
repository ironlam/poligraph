import { describe, it, expect } from "vitest";
import {
  FACTCHECK_MIN_CONTEXT_BLOCKS,
  FACTCHECK_RECORD_MIN_TOTAL,
  countFactCheckContextBlocks,
  factCheckRobotsMetadata,
  isIndexableFactCheck,
  type FactCheckIndexSignals,
} from "../factcheck-robots";

const NO_BLOCK: FactCheckIndexSignals = {
  hasPublishedAuthor: true,
  authorFactCheckCount: 1,
  hasCandidacy: false,
  hasClaimDayVotes: false,
  hasParty: false,
};

describe("isIndexableFactCheck", () => {
  it("indexe un auteur avec un bilan et un parti", () => {
    expect(isIndexableFactCheck({ ...NO_BLOCK, authorFactCheckCount: 5, hasParty: true })).toBe(
      true
    );
  });

  it("n'indexe pas un auteur qui n'a qu'un bloc", () => {
    expect(isIndexableFactCheck({ ...NO_BLOCK, hasParty: true })).toBe(false);
  });

  it("ne compte pas un bilan réduit au fact-check de la page", () => {
    const signals = { ...NO_BLOCK, authorFactCheckCount: 1, hasParty: true };
    expect(countFactCheckContextBlocks(signals)).toBe(1);
    expect(
      countFactCheckContextBlocks({ ...signals, authorFactCheckCount: FACTCHECK_RECORD_MIN_TOTAL })
    ).toBe(2);
  });

  it("compte la candidature et le vote du jour comme des blocs", () => {
    expect(isIndexableFactCheck({ ...NO_BLOCK, hasCandidacy: true, hasClaimDayVotes: true })).toBe(
      true
    );
  });

  it("n'indexe jamais sans auteur publié, quels que soient les autres signaux", () => {
    const signals: FactCheckIndexSignals = {
      hasPublishedAuthor: false,
      authorFactCheckCount: 10,
      hasCandidacy: true,
      hasClaimDayVotes: true,
      hasParty: true,
    };
    expect(countFactCheckContextBlocks(signals)).toBe(0);
    expect(isIndexableFactCheck(signals)).toBe(false);
  });

  it("garde un seuil de deux blocs au moins", () => {
    expect(FACTCHECK_MIN_CONTEXT_BLOCKS).toBeGreaterThanOrEqual(2);
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
