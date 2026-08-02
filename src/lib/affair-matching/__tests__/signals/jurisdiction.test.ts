import { describe, it, expect } from "vitest";
import { JurisdictionSignal } from "../../signals/jurisdiction";
import {
  JURISDICTION_EXACT_MATCH_LLR,
  JURISDICTION_DEPARTMENT_OVERLAP_LLR,
  JURISDICTION_MISMATCH_LLR,
} from "../../signals/constants";
import type {
  AffairCandidateRecord,
  AffairScoringInput,
  AffairSignalContext,
} from "../../signals/types";
import { SourceType } from "@/generated/prisma";
import { EMPTY_SURNAME_VOCABULARY } from "../../surname-ambiguity";

const signal = new JurisdictionSignal();
const context: AffairSignalContext = {
  resolverVersion: "v1",
  vocabulary: EMPTY_SURNAME_VOCABULARY,
};

function candidate(
  departments: string[],
  mandates: AffairCandidateRecord["mandates"] = []
): AffairCandidateRecord {
  return {
    id: "pol-1",
    firstName: "Jean",
    lastName: "Dupont",
    fullName: "Jean Dupont",
    normalizedLastName: "dupont",
    birthDate: null,
    deathDate: null,
    civility: null,
    departments,
    mandates,
    parties: [],
    externalIds: {},
  };
}

function input(overrides: Partial<AffairScoringInput["metadata"]>): AffairScoringInput {
  return {
    text: "",
    metadata: { source: SourceType.JUDILIBRE, ...overrides },
  };
}

describe("JurisdictionSignal", () => {
  it("returns 0 when neither court nor department is set", () => {
    const result = signal.evaluate(input({}), candidate(["75"]), context);
    expect(result.logLikelihoodRatio).toBe(0);
  });

  it("returns JURISDICTION_EXACT_MATCH_LLR when court location matches a mandate location", () => {
    const mandates = [
      {
        type: "MAIRE",
        roleLabel: "Maire de Lyon",
        location: "Lyon",
        startDate: new Date("2014-01-01"),
        endDate: null,
      },
    ];
    const result = signal.evaluate(
      input({ court: "Tribunal de Lyon" }),
      candidate(["69"], mandates),
      context
    );
    expect(result.logLikelihoodRatio).toBe(JURISDICTION_EXACT_MATCH_LLR);
  });

  it("returns JURISDICTION_DEPARTMENT_OVERLAP_LLR when department overlaps but not exact court", () => {
    const result = signal.evaluate(input({ department: "75" }), candidate(["75", "92"]), context);
    expect(result.logLikelihoodRatio).toBe(JURISDICTION_DEPARTMENT_OVERLAP_LLR);
  });

  it("returns JURISDICTION_MISMATCH_LLR when department is known but doesn't overlap", () => {
    const result = signal.evaluate(input({ department: "75" }), candidate(["13", "83"]), context);
    expect(result.logLikelihoodRatio).toBe(JURISDICTION_MISMATCH_LLR);
  });

  it("returns 0 when input has department but candidate has none (neutral)", () => {
    const result = signal.evaluate(input({ department: "75" }), candidate([]), context);
    expect(result.logLikelihoodRatio).toBe(0);
  });
});
