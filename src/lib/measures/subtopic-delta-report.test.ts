import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findElection: vi.fn(),
  countMeasures: vi.fn(),
  findMeasures: vi.fn(),
  searchPublic: vi.fn(),
  classify: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    election: { findUnique: mocks.findElection },
    measure: { count: mocks.countMeasures, findMany: mocks.findMeasures },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/search/query", () => ({ searchPublic: mocks.searchPublic }));
vi.mock("@/lib/measures/subtopic-delta-classifier", () => ({
  classifyMeasureForSubtopicDelta: mocks.classify,
}));

describe("rapport différentiel sans écriture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findElection.mockResolvedValue({ id: "election-1", slug: "presidentielle-2027" });
    mocks.countMeasures.mockResolvedValue(1);
    mocks.searchPublic.mockResolvedValue([]);
    mocks.findMeasures.mockResolvedValue([
      {
        id: "measure-1",
        theme: "SOCIETE_DROITS_LIBERTES",
        politician: { fullName: "Candidate Exemple" },
        publishedRevision: {
          id: "revision-1",
          text: "Lutter contre le racisme.",
          details: null,
          updatedAt: new Date("2026-08-30T00:00:00.000Z"),
          subtopics: [],
        },
      },
    ]);
    mocks.classify.mockResolvedValue({
      decision: "APPLIES",
      confidence: 0.99,
      justification: "Le racisme est explicitement visé.",
      evidenceExcerpt: "Lutter contre le racisme",
      classifierVersion: "mistral:subtopic-delta-v1",
    });
  });

  it("produit les compteurs, la suggestion et le curseur sans mutation", async () => {
    const { generateSubtopicDeltaDryRun } = await import("@/lib/measures/subtopic-delta-report");
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
      selectedCandidates: 1,
      nextAfter: "measure-1",
      decisions: { APPLIES: 1, DOES_NOT_APPLY: 0, UNCERTAIN: 0 },
    });
    expect(report.suggestionsThatWouldBeCreated).toHaveLength(1);
    expect(report.suggestionsThatWouldBeCreated[0]?.sourceFingerprint).toHaveLength(64);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("conserve une erreur individuelle dans le rapport", async () => {
    mocks.classify.mockRejectedValue(new Error("réponse invalide"));
    const { generateSubtopicDeltaDryRun } = await import("@/lib/measures/subtopic-delta-report");
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
    const { generateSubtopicDeltaDryRun } = await import("@/lib/measures/subtopic-delta-report");
    await generateSubtopicDeltaDryRun({
      subtopicSlug: "racisme-antisemitisme",
      electionSlug: "presidentielle-2027",
      limit: 50,
      after: "measure-before",
    });

    expect(mocks.findMeasures).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: "measure-before" }, skip: 1, take: 50 })
    );
  });
});
