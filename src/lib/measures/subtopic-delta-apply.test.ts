import { beforeEach, describe, expect, it, vi } from "vitest";
import { MEASURE_SUBTOPIC_TAXONOMY_VERSION } from "@/config/measure-subtopics";
import { createSubtopicDeltaSourceFingerprint } from "@/lib/measures/subtopic-delta-report";

const mocks = vi.hoisted(() => ({
  findMeasures: vi.fn(),
  findSubtopic: vi.fn(),
  findAssignment: vi.fn(),
  createAssignments: vi.fn(),
  deleteAssignments: vi.fn(),
  createAudit: vi.fn(),
  transaction: vi.fn(),
  syncTaxonomy: vi.fn(),
}));

const transactionClient = {
  measureRevisionSubtopic: {
    findUnique: mocks.findAssignment,
    createMany: mocks.createAssignments,
    deleteMany: mocks.deleteAssignments,
  },
  auditLog: { create: mocks.createAudit },
};

vi.mock("@/lib/db", () => ({
  db: {
    measure: { findMany: mocks.findMeasures },
    measureSubtopic: { findUniqueOrThrow: mocks.findSubtopic },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/measures/subtopics", () => ({
  syncMeasureSubtopicTaxonomy: mocks.syncTaxonomy,
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
    selectedCandidates: 1,
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
    mocks.findMeasures.mockResolvedValue([
      {
        id: "measure-1",
        publishedRevision: {
          id: source.revisionId,
          text: source.text,
          details: source.details,
          updatedAt: new Date(source.sourceUpdatedAt),
        },
      },
    ]);
    mocks.findSubtopic.mockResolvedValue({ id: "subtopic-1", active: true });
    mocks.findAssignment.mockResolvedValue(null);
    mocks.createAssignments.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation(async (callback) => callback(transactionClient));
  });

  it("crée uniquement une suggestion et audite sa provenance", async () => {
    const { applySubtopicDeltaReport } = await import("@/lib/measures/subtopic-delta-apply");
    const result = await applySubtopicDeltaReport(report());

    expect(result).toEqual({ runId: "run-1", created: 1, ignored: [] });
    expect(mocks.createAssignments).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          status: "SUGGESTED",
          taxonomyVersion: MEASURE_SUBTOPIC_TAXONOMY_VERSION,
        }),
      ],
      skipDuplicates: true,
    });
    expect(mocks.createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "PROPOSE_SUBTOPIC_DELTA",
        changes: expect.objectContaining({ runId: "run-1", subtopic: "racisme-antisemitisme" }),
      }),
    });
    expect(mocks.deleteAssignments).not.toHaveBeenCalled();
  });

  it("préserve une attribution existante et reste idempotent", async () => {
    mocks.findAssignment.mockResolvedValue({ status: "APPROVED" });
    const { applySubtopicDeltaReport } = await import("@/lib/measures/subtopic-delta-apply");
    const result = await applySubtopicDeltaReport(report());

    expect(result.ignored).toEqual([{ revisionId: "revision-1", status: "APPROVED" }]);
    expect(mocks.createAssignments).not.toHaveBeenCalled();
    expect(mocks.createAudit).not.toHaveBeenCalled();
  });

  it("refuse tout changement de source avant la première écriture", async () => {
    mocks.findMeasures.mockResolvedValue([
      {
        id: "measure-1",
        publishedRevision: {
          id: source.revisionId,
          text: "Texte modifié.",
          details: null,
          updatedAt: new Date(source.sourceUpdatedAt),
        },
      },
    ]);
    const { applySubtopicDeltaReport } = await import("@/lib/measures/subtopic-delta-apply");

    await expect(applySubtopicDeltaReport(report())).rejects.toThrow("a changé");
    expect(mocks.syncTaxonomy).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("refuse qu’une décision autre que APPLIES soit injectée dans les suggestions", async () => {
    const incoherent = report();
    incoherent.suggestionsThatWouldBeCreated[0] = {
      ...decision,
      decision: "UNCERTAIN",
    };
    const { applySubtopicDeltaReport } = await import("@/lib/measures/subtopic-delta-apply");

    await expect(applySubtopicDeltaReport(incoherent)).rejects.toThrow(
      "ne correspond pas aux décisions APPLIES"
    );
    expect(mocks.syncTaxonomy).not.toHaveBeenCalled();
  });
});
