import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCorpusPage: vi.fn(),
  classify: vi.fn(),
}));

vi.mock("@/lib/data/measure-subtopic-delta", () => ({
  getSubtopicDeltaCorpusPage: mocks.getCorpusPage,
}));
vi.mock("@/services/measures/subtopic-delta-classifier", () => ({
  classifyMeasureForSubtopicDelta: mocks.classify,
}));

describe("rapport différentiel sans écriture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCorpusPage.mockResolvedValue({
      election: { id: "election-1", slug: "presidentielle-2027" },
      totalEligibleMeasures: 1,
      nextAfter: "measure-1",
      searchDocumentMeasureIds: new Set(),
      measures: [
        {
          measureId: "measure-1",
          revisionId: "revision-1",
          sourceUpdatedAt: "2026-08-30T00:00:00.000Z",
          candidateName: "Candidate Exemple",
          theme: "SOCIETE_DROITS_LIBERTES",
          text: "Lutter contre le racisme.",
          details: null,
          existingAssignments: [],
        },
      ],
    });
    mocks.classify.mockResolvedValue({
      decision: "APPLIES",
      confidence: 0.99,
      justification: "Le racisme est explicitement visé.",
      evidenceExcerpt: "Lutter contre le racisme",
      classifierVersion: "mistral:subtopic-delta-v1",
    });
  });

  it("produit les compteurs, la suggestion et le curseur sans mutation", async () => {
    const { generateSubtopicDeltaDryRun } =
      await import("@/services/measures/subtopic-delta-report");
    const report = await generateSubtopicDeltaDryRun({
      subtopicSlug: "racisme-antisemitisme",
      electionSlug: "presidentielle-2027",
      limit: 1,
      runId: "run-test",
    });

    expect(report).toMatchObject({
      runId: "run-test",
      totalEligibleMeasures: 1,
      scannedMeasures: 1,
      selectedMeasureCount: 1,
      nextAfter: "measure-1",
      decisions: { APPLIES: 1, DOES_NOT_APPLY: 0, UNCERTAIN: 0 },
    });
    expect(report.suggestionsThatWouldBeCreated).toHaveLength(1);
    expect(report.suggestionsThatWouldBeCreated[0]?.sourceFingerprint).toHaveLength(64);
  });

  it("conserve une erreur individuelle dans le rapport", async () => {
    mocks.classify.mockRejectedValue(new Error("réponse invalide"));
    const { generateSubtopicDeltaDryRun } =
      await import("@/services/measures/subtopic-delta-report");
    const report = await generateSubtopicDeltaDryRun({
      subtopicSlug: "racisme-antisemitisme",
      electionSlug: "presidentielle-2027",
      limit: 10,
    });

    expect(report.errors).toEqual([
      expect.objectContaining({ measureId: "measure-1", message: "réponse invalide" }),
    ]);
    expect(report.suggestionsThatWouldBeCreated).toEqual([]);
  });

  it("reprend après le curseur fourni", async () => {
    const { generateSubtopicDeltaDryRun } =
      await import("@/services/measures/subtopic-delta-report");
    await generateSubtopicDeltaDryRun({
      subtopicSlug: "racisme-antisemitisme",
      electionSlug: "presidentielle-2027",
      limit: 50,
      after: "measure-before",
    });

    expect(mocks.getCorpusPage).toHaveBeenCalledWith(
      expect.objectContaining({ after: "measure-before", limit: 50 })
    );
  });
});
