import { describe, it, expect } from "vitest";
import { TemporalMandateSignal } from "../../signals/temporal-mandate";
import {
  TEMPORAL_DURING_MANDATE_LLR,
  TEMPORAL_AFTER_MANDATE_LLR,
  TEMPORAL_BEFORE_MANDATE_LLR,
} from "../../signals/constants";
import type {
  AffairCandidateRecord,
  AffairScoringInput,
  AffairSignalContext,
} from "../../signals/types";
import { SourceType } from "@/generated/prisma";
import { EMPTY_SURNAME_VOCABULARY } from "../../surname-ambiguity";

const signal = new TemporalMandateSignal();
const context: AffairSignalContext = {
  resolverVersion: "v1",
  vocabulary: EMPTY_SURNAME_VOCABULARY,
};

function candidate(overrides: Partial<AffairCandidateRecord> = {}): AffairCandidateRecord {
  return {
    id: "pol-1",
    firstName: "Jean",
    lastName: "Dupont",
    fullName: "Jean Dupont",
    normalizedLastName: "dupont",
    birthDate: new Date("1960-01-01"),
    deathDate: null,
    civility: null,
    departments: [],
    mandates: [
      {
        type: "DEPUTE",
        roleLabel: "Député",
        location: null,
        startDate: new Date("2012-06-01"),
        endDate: new Date("2017-06-30"),
      },
    ],
    parties: [],
    externalIds: {},
    ...overrides,
  };
}

function input(factsDate?: Date): AffairScoringInput {
  return {
    text: "",
    metadata: { source: SourceType.PRESSE, factsDate: factsDate ?? undefined },
  };
}

describe("TemporalMandateSignal", () => {
  it("returns 0 when no facts date is provided", () => {
    const result = signal.evaluate(input(), candidate(), context);
    expect(result.logLikelihoodRatio).toBe(0);
  });

  it("returns TEMPORAL_DURING_MANDATE_LLR when facts happened during a mandate", () => {
    const result = signal.evaluate(input(new Date("2015-01-15")), candidate(), context);
    expect(result.logLikelihoodRatio).toBe(TEMPORAL_DURING_MANDATE_LLR);
  });

  it("returns TEMPORAL_AFTER_MANDATE_LLR when facts happened after the last mandate ended", () => {
    const result = signal.evaluate(input(new Date("2020-05-01")), candidate(), context);
    expect(result.logLikelihoodRatio).toBe(TEMPORAL_AFTER_MANDATE_LLR);
  });

  it("returns TEMPORAL_BEFORE_MANDATE_LLR when facts happened before any mandate", () => {
    const result = signal.evaluate(input(new Date("2010-01-01")), candidate(), context);
    expect(result.logLikelihoodRatio).toBe(TEMPORAL_BEFORE_MANDATE_LLR);
  });

  it("disqualifies when politician was not yet born", () => {
    const result = signal.evaluate(input(new Date("1959-01-01")), candidate(), context);
    expect(result.disqualified).toBeDefined();
    expect(result.disqualified?.reason).toContain("not yet born");
  });

  it("disqualifies when politician died more than 10 years before facts", () => {
    const result = signal.evaluate(
      input(new Date("2025-01-01")),
      candidate({ deathDate: new Date("2000-01-01") }),
      context
    );
    expect(result.disqualified).toBeDefined();
    expect(result.disqualified?.reason).toContain("deceased");
  });
});
