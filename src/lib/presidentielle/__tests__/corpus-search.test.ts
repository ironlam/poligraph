import { beforeEach, describe, expect, it, vi } from "vitest";

const findElection = vi.fn();
const findCandidacies = vi.fn();
const findMeasures = vi.fn();
const searchPublicPage = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    election: { findUnique: (...args: unknown[]) => findElection(...args) },
    candidacy: { findMany: (...args: unknown[]) => findCandidacies(...args) },
    measure: { findMany: (...args: unknown[]) => findMeasures(...args) },
  },
}));
vi.mock("@/lib/search/query", () => ({
  searchPublicPage: (...args: unknown[]) => searchPublicPage(...args),
}));

import { searchPresidentialCorpus } from "../corpus-search";

describe("searchPresidentialCorpus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findElection.mockResolvedValue({ id: "election-1", slug: "presidentielle-test" });
    searchPublicPage.mockResolvedValue({
      total: 3,
      hits: [
        { entityType: "CANDIDACY", entityId: "cand-public", title: "Alice", url: "/old" },
        { entityType: "MEASURE", entityId: "measure-public", title: "Logement", url: "/old" },
        { entityType: "MEASURE", entityId: "measure-stale", title: "Fermée", url: "/old" },
      ],
    });
    findCandidacies.mockResolvedValue([
      {
        id: "cand-public",
        candidateName: "Alice Martin",
        status: "DECLARE",
        partyLabel: null,
        politician: {
          slug: "alice-martin",
          photoUrl: null,
          blobPhotoUrl: null,
        },
        party: { name: "Parti test", shortName: "PT" },
      },
    ]);
    findMeasures.mockResolvedValue([
      {
        id: "measure-public",
        theme: "LOGEMENT_URBANISME",
        publishedRevision: {
          text: "Construire des logements publics",
          precision: null,
          sources: [{ sourceKind: "PROGRAMME_CANDIDAT" }],
        },
        candidacy: { candidateName: "Alice Martin" },
      },
    ]);
  });

  it("scope l'index et réhydrate en deux requêtes publiques bornées", async () => {
    const result = await searchPresidentialCorpus("presidentielle-test", "logement", 8);

    expect(searchPublicPage).toHaveBeenCalledWith("logement", {
      electionId: "election-1",
      limit: 8,
    });
    expect(findCandidacies.mock.calls[0]?.[0]).toMatchObject({
      where: { electionId: "election-1" },
    });
    expect(findMeasures.mock.calls[0]?.[0]).toMatchObject({
      where: { electionId: "election-1" },
    });
    expect(result?.candidacies[0]).toMatchObject({
      name: "Alice Martin",
      party: "PT",
      url: "/elections/presidentielle-test/candidats/alice-martin",
    });
    expect(result?.measures[0]).toMatchObject({
      text: "Construire des logements publics",
      url: "/elections/presidentielle-test/mesures/measure-public",
    });
    expect(result?.subjects).toEqual([
      {
        type: "subject",
        theme: "LOGEMENT_URBANISME",
        label: "Logement et urbanisme",
        url: "/elections/presidentielle-test/themes/logement-urbanisme",
      },
    ]);
  });

  it("écarte défensivement un document devenu privé sans exposer son total", async () => {
    const result = await searchPresidentialCorpus("presidentielle-test", "logement", 8);
    expect(result?.measures.map((measure) => measure.id)).not.toContain("measure-stale");
    expect(result?.total).toBe(3);
  });

  it("ne consulte pas l'index pour une requête trop courte", async () => {
    const result = await searchPresidentialCorpus("presidentielle-test", "a", 8);
    expect(result).toMatchObject({ total: 0, subjects: [], candidacies: [], measures: [] });
    expect(searchPublicPage).not.toHaveBeenCalled();
  });
});
