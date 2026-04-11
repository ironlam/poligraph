import { describe, it, expect } from "vitest";
import { PartyContextSignal } from "../../signals/party-context";
import {
  PARTY_MATCH_LLR,
  PARTY_FORMER_MATCH_LLR,
  PARTY_MISMATCH_LLR,
} from "../../signals/constants";
import type {
  AffairCandidateRecord,
  AffairScoringInput,
  AffairSignalContext,
} from "../../signals/types";
import { SourceType } from "@/generated/prisma";

const signal = new PartyContextSignal();
const context: AffairSignalContext = { resolverVersion: "v1" };

function candidate(parties: AffairCandidateRecord["parties"]): AffairCandidateRecord {
  return {
    id: "pol-1",
    firstName: "Jean",
    lastName: "Dupont",
    fullName: "Jean Dupont",
    normalizedLastName: "dupont",
    birthDate: null,
    deathDate: null,
    civility: null,
    departments: [],
    mandates: [],
    parties,
    externalIds: {},
  };
}

function input(text: string, factsDate?: Date): AffairScoringInput {
  return { text, metadata: { source: SourceType.PRESSE, factsDate } };
}

describe("PartyContextSignal", () => {
  it("returns PARTY_MATCH_LLR when text party matches a current party", () => {
    const result = signal.evaluate(
      input("Le député PS Jean Dupont a été entendu."),
      candidate([
        {
          partyLabel: "PS",
          startDate: new Date("2010-01-01"),
          endDate: null,
          current: true,
        },
      ]),
      context
    );
    expect(result.logLikelihoodRatio).toBe(PARTY_MATCH_LLR);
  });

  it("returns PARTY_FORMER_MATCH_LLR when text party matches a past party", () => {
    const result = signal.evaluate(
      input("L'ancien député PS Jean Dupont a comparu."),
      candidate([
        {
          partyLabel: "PS",
          startDate: new Date("2002-01-01"),
          endDate: new Date("2017-06-01"),
          current: false,
        },
        {
          partyLabel: "LR",
          startDate: new Date("2017-06-02"),
          endDate: null,
          current: true,
        },
      ]),
      context
    );
    expect(result.logLikelihoodRatio).toBe(PARTY_FORMER_MATCH_LLR);
  });

  it("returns PARTY_MISMATCH_LLR when text party conflicts with all known parties", () => {
    const result = signal.evaluate(
      input("Le député RN Jean Dupont est mis en cause."),
      candidate([
        {
          partyLabel: "PS",
          startDate: new Date("2010-01-01"),
          endDate: null,
          current: true,
        },
      ]),
      context
    );
    expect(result.logLikelihoodRatio).toBe(PARTY_MISMATCH_LLR);
  });

  it("returns 0 when no party is mentioned in text", () => {
    const result = signal.evaluate(
      input("Le député Jean Dupont a été entendu."),
      candidate([
        {
          partyLabel: "PS",
          startDate: null,
          endDate: null,
          current: true,
        },
      ]),
      context
    );
    expect(result.logLikelihoodRatio).toBe(0);
  });
});
