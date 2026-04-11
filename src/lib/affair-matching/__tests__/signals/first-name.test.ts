import { describe, it, expect } from "vitest";
import { FirstNameSignal } from "../../signals/first-name";
import { FIRST_NAME_NEAR_LLR, FIRST_NAME_ABSENT_LLR } from "../../signals/constants";
import type {
  AffairCandidateRecord,
  AffairScoringInput,
  AffairSignalContext,
} from "../../signals/types";
import { SourceType } from "@/generated/prisma";

const signal = new FirstNameSignal();
const context: AffairSignalContext = { resolverVersion: "v1" };

function makeCandidate(firstName = "Jean", lastName = "Dupont"): AffairCandidateRecord {
  return {
    id: "pol-1",
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    normalizedLastName: lastName.toLowerCase(),
    birthDate: null,
    deathDate: null,
    civility: null,
    departments: [],
    mandates: [],
    parties: [],
    externalIds: {},
  };
}

function makeInput(text: string): AffairScoringInput {
  return { text, metadata: { source: SourceType.PRESSE } };
}

describe("FirstNameSignal", () => {
  it("returns FIRST_NAME_NEAR_LLR when first name appears near surname", () => {
    const result = signal.evaluate(
      makeInput("Le député Jean Dupont a été mis en examen."),
      makeCandidate(),
      context
    );
    expect(result.logLikelihoodRatio).toBe(FIRST_NAME_NEAR_LLR);
  });

  it("returns FIRST_NAME_ABSENT_LLR when first name is not in text", () => {
    const result = signal.evaluate(
      makeInput("M. Dupont a comparu hier."),
      makeCandidate(),
      context
    );
    expect(result.logLikelihoodRatio).toBe(FIRST_NAME_ABSENT_LLR);
  });

  it("returns 0 when there is no candidate first name", () => {
    const result = signal.evaluate(
      makeInput("Dupont est cité."),
      makeCandidate("", "Dupont"),
      context
    );
    expect(result.logLikelihoodRatio).toBe(0);
  });

  it("is case- and accent-insensitive", () => {
    const result = signal.evaluate(
      makeInput("HÉLÈNE DUPRÉ a été interrogée."),
      makeCandidate("Hélène", "Dupré"),
      context
    );
    expect(result.logLikelihoodRatio).toBe(FIRST_NAME_NEAR_LLR);
  });
});
