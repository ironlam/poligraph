import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findElection: vi.fn(),
  countMeasures: vi.fn(),
  findMeasures: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    election: { findUnique: mocks.findElection },
    measure: { count: mocks.countMeasures, findMany: mocks.findMeasures },
    $queryRaw: mocks.queryRaw,
  },
}));

function row(id: string) {
  return {
    id,
    theme: "SOCIETE_DROITS_LIBERTES",
    politician: { fullName: "Candidate Exemple" },
    publishedRevision: {
      id: `revision-${id}`,
      text: "Lutter contre le racisme.",
      details: null,
      updatedAt: new Date("2026-08-30T00:00:00.000Z"),
      subtopics: [],
    },
  };
}

describe("page de corpus pour l’analyse différentielle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findElection.mockResolvedValue({ id: "election-1", slug: "presidentielle-2027" });
    mocks.countMeasures.mockResolvedValue(3);
    mocks.queryRaw.mockResolvedValue([]);
  });

  it("reprend deux pages ordonnées sans réutiliser le dernier identifiant", async () => {
    mocks.findMeasures.mockResolvedValueOnce([row("measure-1"), row("measure-2")]);
    const { getSubtopicDeltaCorpusPage } = await import("@/lib/data/measure-subtopic-delta");
    const first = await getSubtopicDeltaCorpusPage({
      electionSlug: "presidentielle-2027",
      theme: "SOCIETE_DROITS_LIBERTES",
      searchTerms: ["racisme"],
      limit: 2,
    });

    mocks.findMeasures.mockResolvedValueOnce([row("measure-3")]);
    const second = await getSubtopicDeltaCorpusPage({
      electionSlug: "presidentielle-2027",
      theme: "SOCIETE_DROITS_LIBERTES",
      searchTerms: ["racisme"],
      limit: 2,
      after: first.nextAfter ?? undefined,
    });

    expect(first.measures.map((measure) => measure.measureId)).toEqual(["measure-1", "measure-2"]);
    expect(second.measures.map((measure) => measure.measureId)).toEqual(["measure-3"]);
    expect(mocks.findMeasures.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ cursor: { id: "measure-2" }, skip: 1 })
    );
  });
});
