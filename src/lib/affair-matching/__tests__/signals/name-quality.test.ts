import { describe, it, expect } from "vitest";
import { NameQualitySignal } from "../../signals/name-quality";
import {
  NAME_FULL_EXACT_LLR,
  NAME_LEGAL_TITLE_SURNAME_LLR,
  NAME_SURNAME_PROXIMITY_LLR,
  NAME_SURNAME_ONLY_LLR,
} from "../../signals/constants";
import type {
  AffairScoringInput,
  AffairCandidateRecord,
  AffairSignalContext,
} from "../../signals/types";
import { SourceType } from "@/generated/prisma";

const signal = new NameQualitySignal();
const context: AffairSignalContext = { resolverVersion: "v1" };

function makeCandidate(overrides: Partial<AffairCandidateRecord> = {}): AffairCandidateRecord {
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
    parties: [],
    externalIds: {},
    ...overrides,
  };
}

function makeInput(text: string): AffairScoringInput {
  return { text, metadata: { source: SourceType.PRESSE } };
}

describe("NameQualitySignal", () => {
  it("disqualifies candidates whose surname is not present in the text", () => {
    const result = signal.evaluate(
      makeInput("Le maire de Lyon a été mis en examen."),
      makeCandidate(),
      context
    );
    expect(result.disqualified).toBeDefined();
    expect(result.disqualified?.reason).toContain("surname not present");
  });

  it("returns NAME_FULL_EXACT_LLR when the full name appears verbatim", () => {
    const result = signal.evaluate(
      makeInput("Le député Jean Dupont a été interrogé hier."),
      makeCandidate(),
      context
    );
    expect(result.logLikelihoodRatio).toBe(NAME_FULL_EXACT_LLR);
    expect(result.evidence).toMatchObject({ matchType: "FULL_EXACT" });
  });

  it("returns NAME_LEGAL_TITLE_SURNAME_LLR on 'M. Dupont'", () => {
    const result = signal.evaluate(
      makeInput("M. Dupont a comparu devant le tribunal."),
      makeCandidate(),
      context
    );
    expect(result.logLikelihoodRatio).toBe(NAME_LEGAL_TITLE_SURNAME_LLR);
    expect(result.evidence).toMatchObject({ matchType: "LEGAL_TITLE_SURNAME" });
  });

  it("returns NAME_SURNAME_PROXIMITY_LLR when first and last name appear within 80 chars", () => {
    const text = "Selon le rapport, Jean, qui préside le conseil, et Dupont ont été cités.";
    const result = signal.evaluate(makeInput(text), makeCandidate(), context);
    expect(result.logLikelihoodRatio).toBe(NAME_SURNAME_PROXIMITY_LLR);
    expect(result.evidence).toMatchObject({ matchType: "PROXIMITY" });
  });

  it("returns NAME_SURNAME_ONLY_LLR when only the surname appears and is not a common word", () => {
    const result = signal.evaluate(
      makeInput("Dupont aurait reçu des fonds non déclarés."),
      makeCandidate(),
      context
    );
    expect(result.logLikelihoodRatio).toBe(NAME_SURNAME_ONLY_LLR);
    expect(result.evidence).toMatchObject({ matchType: "SURNAME_ONLY" });
  });

  it("handles accented surnames correctly", () => {
    const candidate = makeCandidate({
      firstName: "Hélène",
      lastName: "Dupré",
      fullName: "Hélène Dupré",
      normalizedLastName: "dupre",
    });
    const result = signal.evaluate(
      makeInput("Mme Dupré a été mise en examen."),
      candidate,
      context
    );
    expect(result.logLikelihoodRatio).toBe(NAME_LEGAL_TITLE_SURNAME_LLR);
  });

  it("disqualifies when the surname is too short", () => {
    const candidate = makeCandidate({
      lastName: "Do",
      fullName: "Jean Do",
      normalizedLastName: "do",
    });
    const result = signal.evaluate(makeInput("Le sujet Jean Do est évoqué."), candidate, context);
    expect(result.disqualified).toBeDefined();
  });
});
