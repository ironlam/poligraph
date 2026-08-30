import { beforeEach, describe, expect, it, vi } from "vitest";
import { MEASURE_SUBTOPIC_TAXONOMY_VERSION } from "@/config/measure-subtopics";
import { createSubtopicDeltaSourceFingerprint } from "@/lib/measures/subtopic-delta-fingerprint";

const mocks = vi.hoisted(() => ({
  getApplySnapshot: vi.fn(),
  proposeDelta: vi.fn(),
  syncTaxonomy: vi.fn(),
}));

vi.mock("@/lib/data/measure-subtopic-delta", () => ({
  getSubtopicDeltaApplySnapshot: mocks.getApplySnapshot,
}));
vi.mock("@/lib/measures/subtopics", () => ({
  syncMeasureSubtopicTaxonomy: mocks.syncTaxonomy,
  proposeMeasureRevisionSubtopicDelta: mocks.proposeDelta,
}));

const source = {
  revisionId: "revision-1",
  sourceUpdatedAt: "2026-08-30T00:00:00.000Z",
  text: "Lutter contre le racisme.",
  details: null,
};
const decision = {
  measureId: "measure-1",
  revisionId: source.revisionId,
  sourceUpdatedAt: source.sourceUpdatedAt,
  sourceFingerprint: createSubtopicDeltaSourceFingerprint(source),
  candidateName: "Candidate Exemple",
  theme: "SOCIETE_DROITS_LIBERTES",
  control: false,
  selectionReasons: [{ signal: "LEXICAL", values: ["racisme"] }],
  decision: "APPLIES",
  confidence: 0.99,
  justification: "La mesure vise explicitement le racisme.",
  evidenceExcerpt: "Lutter contre le racisme",
  classifierVersion: "mistral:subtopic-delta-v1",
};

function report() {
  return {
    schemaVersion: 1,
    runId: "run-1",
    createdAt: "2026-08-30T00:10:00.000Z",
    taxonomy: {
      previousVersion: "2026-08-29-v3",
      currentVersion: MEASURE_SUBTOPIC_TAXONOMY_VERSION,
    },
    subtopic: {
      slug: "racisme-antisemitisme",
      label: "Racisme et antisémitisme",
      theme: "SOCIETE_DROITS_LIBERTES",
    },
    election: { id: "election-1", slug: "presidentielle-2027" },
    parameters: {
      subtopic: "racisme-antisemitisme",
      election: "presidentielle-2027",
      limit: 500,
      after: null,
      dryRun: true,
    },
    totalEligibleMeasures: 1,
    scannedMeasures: 1,
    nextAfter: null,
    selectedMeasureCount: 1,
    selectionBySignal: { LEXICAL: 1, NEIGHBOR_SUBTOPIC: 0, SEARCH_INDEX: 0, CONTROL: 0 },
    decisions: { APPLIES: 1, DOES_NOT_APPLY: 0, UNCERTAIN: 0 },
    distribution: {
      byCandidate: { "Candidate Exemple": 1 },
      byTheme: { SOCIETE_DROITS_LIBERTES: 1 },
    },
    suggestionsThatWouldBeCreated: [decision],
    ignoredExisting: [],
    controlSample: [],
    results: [decision],
    errors: [],
  };
}

describe("application d’un rapport différentiel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getApplySnapshot.mockResolvedValue({
      electionMatches: true,
      measures: [
        {
          id: "measure-1",
          publishedRevision: {
            id: source.revisionId,
            text: source.text,
            details: source.details,
            updatedAt: new Date(source.sourceUpdatedAt),
          },
        },
      ],
    });
    mocks.proposeDelta.mockResolvedValue({ created: true, status: "SUGGESTED" });
  });

  it("crée uniquement une suggestion et audite sa provenance", async () => {
    const { applySubtopicDeltaReport } = await import("@/services/measures/subtopic-delta-apply");
    const result = await applySubtopicDeltaReport(report());

    expect(result).toEqual({ runId: "run-1", created: 1, ignored: [] });
    expect(mocks.proposeDelta).toHaveBeenCalledWith({
      measureId: "measure-1",
      revisionId: "revision-1",
      subtopicSlug: "racisme-antisemitisme",
      confidence: 0.99,
      classifierVersion: "mistral:subtopic-delta-v1",
      taxonomyVersion: MEASURE_SUBTOPIC_TAXONOMY_VERSION,
      runId: "run-1",
      decision: "APPLIES",
      justification: "La mesure vise explicitement le racisme.",
      evidenceExcerpt: "Lutter contre le racisme",
      selectionReasons: [{ signal: "LEXICAL", values: ["racisme"] }],
      sourceFingerprint: decision.sourceFingerprint,
      proposedBy: "cli",
    });
  });

  it("préserve une attribution existante et reste idempotent", async () => {
    mocks.proposeDelta.mockResolvedValue({ created: false, status: "APPROVED" });
    const { applySubtopicDeltaReport } = await import("@/services/measures/subtopic-delta-apply");
    const result = await applySubtopicDeltaReport(report());

    expect(result.ignored).toEqual([{ revisionId: "revision-1", status: "APPROVED" }]);
    expect(mocks.proposeDelta).toHaveBeenCalledOnce();
  });

  it("refuse tout changement de source avant la première écriture", async () => {
    mocks.getApplySnapshot.mockResolvedValue({
      electionMatches: true,
      measures: [
        {
          id: "measure-1",
          publishedRevision: {
            id: source.revisionId,
            text: "Texte modifié.",
            details: null,
            updatedAt: new Date(source.sourceUpdatedAt),
          },
        },
      ],
    });
    const { applySubtopicDeltaReport } = await import("@/services/measures/subtopic-delta-apply");

    await expect(applySubtopicDeltaReport(report())).rejects.toThrow("a changé");
    expect(mocks.syncTaxonomy).not.toHaveBeenCalled();
    expect(mocks.proposeDelta).not.toHaveBeenCalled();
  });

  it("refuse une élection qui ne correspond plus au rapport", async () => {
    mocks.getApplySnapshot.mockResolvedValue({ electionMatches: false, measures: [] });
    const { applySubtopicDeltaReport } = await import("@/services/measures/subtopic-delta-apply");

    await expect(applySubtopicDeltaReport(report())).rejects.toThrow(
      "ne correspond plus à la base"
    );
    expect(mocks.syncTaxonomy).not.toHaveBeenCalled();
    expect(mocks.proposeDelta).not.toHaveBeenCalled();
  });

  it("refuse qu’une décision autre que APPLIES soit injectée dans les suggestions", async () => {
    const incoherent = report();
    incoherent.suggestionsThatWouldBeCreated[0] = {
      ...decision,
      decision: "UNCERTAIN",
    };
    const { applySubtopicDeltaReport } = await import("@/services/measures/subtopic-delta-apply");

    await expect(applySubtopicDeltaReport(incoherent)).rejects.toThrow(
      "ne correspond pas aux décisions APPLIES"
    );
    expect(mocks.syncTaxonomy).not.toHaveBeenCalled();
  });
});
