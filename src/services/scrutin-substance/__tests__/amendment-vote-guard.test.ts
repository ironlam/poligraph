import { describe, it, expect } from "vitest";
import {
  canDescribeVotedMeasure,
  isAmendmentLevelSubstance,
  isAmendmentVote,
} from "@/services/scrutin-substance/amendment-vote-guard";

// Scrutin VTANR5L17V9336: the title names amendment I-1358 (a digital-data tax)
// without saying what it does. Generated without its text, the summary and the
// citizen impact described an energy-renovation aid for households.
const V9336_TITLE =
  "l'amendement n° 1358 de M. Lhardit après l'article 15 (examen prioritaire) du projet de loi de finances pour 2027 (première lecture).";

describe("isAmendmentVote", () => {
  it("is true for the AMENDEMENT type", () => {
    expect(isAmendmentVote({ type: "AMENDEMENT", title: "titre sans numéro" })).toBe(true);
  });

  it("is true when the title cites an amendment even if the type is missing", () => {
    expect(isAmendmentVote({ type: null, title: V9336_TITLE })).toBe(true);
  });

  it("is true for a sous-amendement title", () => {
    expect(
      isAmendmentVote({
        type: "AUTRE",
        title: "le sous-amendement n° 2368 de M. Potier à l'amendement n° 2058 du Gouvernement",
      })
    ).toBe(true);
  });

  it("is false for a whole-text vote", () => {
    expect(
      isAmendmentVote({
        type: "FINAL",
        title: "l'ensemble du projet de loi de finances pour 2027 (première lecture).",
      })
    ).toBe(false);
  });
});

describe("isAmendmentLevelSubstance", () => {
  it("accepts amendment and sous-amendment text only", () => {
    expect(isAmendmentLevelSubstance("amendment")).toBe(true);
    expect(isAmendmentLevelSubstance("subAmendment")).toBe(true);
    expect(isAmendmentLevelSubstance("exposeDesMotifs")).toBe(false);
    expect(isAmendmentLevelSubstance(null)).toBe(false);
  });
});

describe("canDescribeVotedMeasure", () => {
  it("refuses V9336 while its amendment is not linked (no substance)", () => {
    expect(
      canDescribeVotedMeasure({ type: "AMENDEMENT", title: V9336_TITLE, substanceDepth: null })
    ).toBe(false);
  });

  it("refuses an amendment vote grounded only on the bill's exposé des motifs", () => {
    expect(
      canDescribeVotedMeasure({
        type: "AMENDEMENT",
        title: V9336_TITLE,
        substanceDepth: "exposeDesMotifs",
      })
    ).toBe(false);
  });

  it("allows an amendment vote grounded on the amendment's own text", () => {
    expect(
      canDescribeVotedMeasure({
        type: "AMENDEMENT",
        title: V9336_TITLE,
        substanceDepth: "amendment",
      })
    ).toBe(true);
  });

  it("does not gate non-amendment votes", () => {
    expect(
      canDescribeVotedMeasure({
        type: "FINAL",
        title: "l'ensemble du projet de loi de finances pour 2027",
        substanceDepth: null,
      })
    ).toBe(true);
  });
});
