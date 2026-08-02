import { describe, it, expect } from "vitest";
import { ContextPlausibilitySignal } from "../../signals/context-plausibility";
import { FRENCH_ANCHOR_LLR, FOREIGN_CONTEXT_PENALTY_LLR } from "../../signals/constants";
import type {
  AffairCandidateRecord,
  AffairScoringInput,
  AffairSignalContext,
} from "../../signals/types";
import { SourceType } from "@/generated/prisma";
import { EMPTY_SURNAME_VOCABULARY } from "../../surname-ambiguity";

const signal = new ContextPlausibilitySignal();
const context: AffairSignalContext = {
  resolverVersion: "v1",
  vocabulary: EMPTY_SURNAME_VOCABULARY,
};

function candidate(): AffairCandidateRecord {
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
  };
}

function input(text: string): AffairScoringInput {
  return { text, metadata: { source: SourceType.PRESSE } };
}

describe("ContextPlausibilitySignal", () => {
  it("returns FRENCH_ANCHOR_LLR when text contains a French institution", () => {
    const result = signal.evaluate(
      input("L'Assemblée nationale a voté hier en faveur de la motion."),
      candidate(),
      context
    );
    expect(result.logLikelihoodRatio).toBe(FRENCH_ANCHOR_LLR);
  });

  it("returns FRENCH_ANCHOR_LLR when text contains a French party acronym", () => {
    const result = signal.evaluate(
      input("Le député PS a déposé un amendement."),
      candidate(),
      context
    );
    expect(result.logLikelihoodRatio).toBe(FRENCH_ANCHOR_LLR);
  });

  it("returns FOREIGN_CONTEXT_PENALTY_LLR when foreign context dominates and no French anchor", () => {
    const result = signal.evaluate(
      input("Le maire de Madrid a été interpellé par la police espagnole à Barcelone."),
      candidate(),
      context
    );
    expect(result.logLikelihoodRatio).toBe(FOREIGN_CONTEXT_PENALTY_LLR);
  });

  it("returns 0 when both French anchors and foreign indicators are present", () => {
    const result = signal.evaluate(
      input("La cour de cassation a rejeté l'appel espagnol concernant Madrid."),
      candidate(),
      context
    );
    expect(result.logLikelihoodRatio).toBe(0);
  });

  it("returns 0 when neither French nor foreign anchors are detected", () => {
    const result = signal.evaluate(
      input("Une enquête est en cours suite à des allégations graves."),
      candidate(),
      context
    );
    expect(result.logLikelihoodRatio).toBe(0);
  });
});
