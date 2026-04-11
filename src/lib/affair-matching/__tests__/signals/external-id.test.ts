import { describe, it, expect } from "vitest";
import { ExternalIdSignal } from "../../signals/external-id";
import { EXTERNAL_ID_MATCH_LLR } from "../../signals/constants";
import type {
  AffairScoringInput,
  AffairCandidateRecord,
  AffairSignalContext,
} from "../../signals/types";
import { SourceType } from "@/generated/prisma";

const signal = new ExternalIdSignal();
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

function makeInput(overrides: Partial<AffairScoringInput> = {}): AffairScoringInput {
  return {
    text: "",
    metadata: { source: SourceType.JUDILIBRE },
    ...overrides,
  };
}

describe("ExternalIdSignal", () => {
  it("returns 0 logLR when no external ID is provided", () => {
    const result = signal.evaluate(makeInput(), makeCandidate(), context);
    expect(result.logLikelihoodRatio).toBe(0);
    expect(result.disqualified).toBeUndefined();
  });

  it("fires when input ECLI matches a candidate external ID", () => {
    const input = makeInput({
      metadata: {
        source: SourceType.JUDILIBRE,
        externalIds: { ecli: "ECLI:FR:CCASS:2024:12345" },
      },
    });
    const candidate = makeCandidate({
      externalIds: { ecli: "ECLI:FR:CCASS:2024:12345" },
    });
    const result = signal.evaluate(input, candidate, context);
    expect(result.logLikelihoodRatio).toBe(EXTERNAL_ID_MATCH_LLR);
    expect(result.evidence).toMatchObject({ matchedKey: "ecli" });
  });

  it("fires when input Wikidata Q-ID matches the candidate", () => {
    const input = makeInput({
      metadata: {
        source: SourceType.WIKIDATA,
        externalIds: { wikidataQId: "Q12345" },
      },
    });
    const candidate = makeCandidate({ externalIds: { wikidata: "Q12345" } });
    const result = signal.evaluate(input, candidate, context);
    expect(result.logLikelihoodRatio).toBe(EXTERNAL_ID_MATCH_LLR);
  });

  it("returns 0 when external IDs are present but none match", () => {
    const input = makeInput({
      metadata: {
        source: SourceType.JUDILIBRE,
        externalIds: { ecli: "ECLI:FR:CCASS:2024:99999" },
      },
    });
    const candidate = makeCandidate({
      externalIds: { ecli: "ECLI:FR:CCASS:2024:12345" },
    });
    const result = signal.evaluate(input, candidate, context);
    expect(result.logLikelihoodRatio).toBe(0);
  });
});
