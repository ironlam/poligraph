import { describe, it, expect } from "vitest";
import { RoleContextSignal } from "../../signals/role-context";
import {
  ROLE_LOCATION_MATCH_LLR,
  ROLE_GENERIC_MATCH_LLR,
  ROLE_MISMATCH_LLR,
} from "../../signals/constants";
import type {
  AffairCandidateRecord,
  AffairScoringInput,
  AffairSignalContext,
} from "../../signals/types";
import { SourceType } from "@/generated/prisma";

const signal = new RoleContextSignal();
const context: AffairSignalContext = { resolverVersion: "v1" };

function candidate(mandates: AffairCandidateRecord["mandates"]): AffairCandidateRecord {
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
    mandates,
    parties: [],
    externalIds: {},
  };
}

function input(text: string): AffairScoringInput {
  return { text, metadata: { source: SourceType.PRESSE } };
}

describe("RoleContextSignal", () => {
  it("returns ROLE_LOCATION_MATCH_LLR when 'maire de Lyon' matches a Lyon mayor mandate", () => {
    const mandates = [
      {
        type: "MAIRE",
        roleLabel: "Maire",
        location: "Lyon",
        startDate: new Date("2014-01-01"),
        endDate: null,
      },
    ];
    const result = signal.evaluate(
      input("Le maire de Lyon, Jean Dupont, a été mis en examen."),
      candidate(mandates),
      context
    );
    expect(result.logLikelihoodRatio).toBe(ROLE_LOCATION_MATCH_LLR);
  });

  it("returns ROLE_GENERIC_MATCH_LLR when text says 'député' and candidate has any DEPUTE mandate", () => {
    const mandates = [
      {
        type: "DEPUTE",
        roleLabel: "Député",
        location: null,
        startDate: new Date("2017-06-01"),
        endDate: null,
      },
    ];
    const result = signal.evaluate(
      input("Le député Jean Dupont a répondu aux questions."),
      candidate(mandates),
      context
    );
    expect(result.logLikelihoodRatio).toBe(ROLE_GENERIC_MATCH_LLR);
  });

  it("returns ROLE_MISMATCH_LLR when text says 'sénateur' but candidate is a député", () => {
    const mandates = [
      {
        type: "DEPUTE",
        roleLabel: "Député",
        location: null,
        startDate: new Date("2017-06-01"),
        endDate: null,
      },
    ];
    const result = signal.evaluate(
      input("Le sénateur Jean Dupont aurait reçu des sommes non déclarées."),
      candidate(mandates),
      context
    );
    expect(result.logLikelihoodRatio).toBe(ROLE_MISMATCH_LLR);
  });

  it("returns 0 when the text mentions no role at all", () => {
    const mandates = [
      {
        type: "DEPUTE",
        roleLabel: "Député",
        location: null,
        startDate: new Date("2017-06-01"),
        endDate: null,
      },
    ];
    const result = signal.evaluate(
      input("Jean Dupont a répondu aux journalistes."),
      candidate(mandates),
      context
    );
    expect(result.logLikelihoodRatio).toBe(0);
  });

  it("returns 0 when candidate has no mandates", () => {
    const result = signal.evaluate(input("Le député Jean Dupont a parlé."), candidate([]), context);
    expect(result.logLikelihoodRatio).toBe(0);
  });
});
