import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AffairCandidateRecord, AffairScoringInput } from "../signals/types";
import type { AffairResolverContext } from "../persistence";
import type { SurnameVocabulary } from "../surname-ambiguity";
import { CandidatePrefilter } from "../candidate-prefilter";

const persistence = vi.hoisted(() => ({
  computeTextHash: vi.fn(() => "hash"),
  loadAffairResolverContext: vi.fn(),
  loadBlocklist: vi.fn(),
  persistDecision: vi.fn(),
}));

vi.mock("../persistence", () => persistence);

import { previewAffairPolitician, resolveAffairPolitician } from "../resolver";

const input: AffairScoringInput = {
  text: "Jean Martin est cité dans cette affaire.",
  metadata: {
    source: "PRESSE",
    sourceRef: "article-1",
    externalIds: { wikidataQId: "Q1" },
  },
};

const candidate: AffairCandidateRecord = {
  id: "pol-1",
  firstName: "Jean",
  lastName: "Martin",
  fullName: "Jean Martin",
  normalizedLastName: "martin",
  birthDate: null,
  deathDate: null,
  civility: null,
  departments: [],
  mandates: [],
  parties: [],
  externalIds: { WIKIDATA: "Q1" },
};

const vocabulary = { lookup: () => null } as unknown as SurnameVocabulary;

function makeContext(): AffairResolverContext {
  return { candidatePool: [candidate], vocabulary, prefilter: new CandidatePrefilter([candidate]) };
}

beforeEach(() => {
  vi.clearAllMocks();
  persistence.loadAffairResolverContext.mockResolvedValue(makeContext());
  persistence.loadBlocklist.mockResolvedValue(new Set<string>());
  persistence.persistDecision.mockResolvedValue({ decisionId: "decision-1", created: true });
});

describe("resolver context", () => {
  it("réutilise le contexte chargé une fois pour 100 affaires", async () => {
    const context = await persistence.loadAffairResolverContext();

    await Promise.all(
      Array.from({ length: 100 }, (_, index) =>
        resolveAffairPolitician(
          { ...input, metadata: { ...input.metadata, sourceRef: `${index}` } },
          context
        )
      )
    );

    expect(persistence.loadAffairResolverContext).toHaveBeenCalledOnce();
    expect(persistence.loadBlocklist).toHaveBeenCalledTimes(100);
    expect(persistence.persistDecision).toHaveBeenCalledTimes(100);
  });

  it("relit la blocklist pour chaque affaire et exclut une exclusion enregistrée", async () => {
    const context = makeContext();
    persistence.loadBlocklist
      .mockResolvedValueOnce(new Set<string>())
      .mockResolvedValueOnce(new Set(["pol-1"]));

    const first = await previewAffairPolitician(input, context);
    const second = await previewAffairPolitician(input, context);

    expect(first.topCandidateId).toBe("pol-1");
    expect(second.judgment).toBe("NO_MATCH");
    expect(second.topCandidateId).toBeNull();
    expect(persistence.persistDecision).not.toHaveBeenCalled();
  });

  it("conserve les mêmes décision et scores avec ou sans contexte partagé", async () => {
    const shared = makeContext();

    const withContext = await resolveAffairPolitician(input, shared);
    const withoutContext = await resolveAffairPolitician(input);

    expect(withContext).toMatchObject({
      judgment: withoutContext.judgment,
      topCandidateId: withoutContext.topCandidateId,
      topScore: withoutContext.topScore,
      gap: withoutContext.gap,
      topCandidates: withoutContext.topCandidates,
    });
  });

  it("ne transforme pas un échec de chargement en NO_MATCH", async () => {
    persistence.loadAffairResolverContext.mockRejectedValue(new Error("database unavailable"));

    await expect(resolveAffairPolitician(input)).rejects.toThrow("database unavailable");
    expect(persistence.persistDecision).not.toHaveBeenCalled();
  });
});
