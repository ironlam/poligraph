import { beforeEach, describe, expect, it, vi } from "vitest";

const findElection = vi.fn();
const findCandidacies = vi.fn();
const findMeasures = vi.fn();
const findSubtopic = vi.fn();
const listMeasures = vi.fn();
const searchPublicPage = vi.fn();
const searchPresidentialPage = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    election: { findUnique: (...args: unknown[]) => findElection(...args) },
    candidacy: { findMany: (...args: unknown[]) => findCandidacies(...args) },
    measure: { findMany: (...args: unknown[]) => findMeasures(...args) },
    measureSubtopic: { findUnique: (...args: unknown[]) => findSubtopic(...args) },
  },
}));
vi.mock("@/lib/data/measures", () => ({
  listPublicPresidentialMeasures: (...args: unknown[]) => listMeasures(...args),
}));
vi.mock("@/lib/search/query", () => ({
  searchPublicPage: (...args: unknown[]) => searchPublicPage(...args),
}));
vi.mock("@/services/presidentielle/hybrid-search", () => ({
  searchPresidentialPage: (...args: unknown[]) => searchPresidentialPage(...args),
}));

import {
  candidateNameIsMentioned,
  searchPresidentialCorpus,
} from "@/services/presidentielle/corpus-search";

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
    searchPresidentialPage.mockResolvedValue({
      strategy: "lexical",
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
        slug: "alice-martin-construire-des-logements-publics",
        theme: "LOGEMENT_URBANISME",
        publishedRevision: {
          text: "Construire des logements publics",
          precision: null,
          sources: [{ sourceKind: "PROGRAMME_CANDIDAT", url: "https://example.org/programme" }],
        },
        candidacy: { candidateName: "Alice Martin", politician: { slug: "alice-martin" } },
      },
    ]);
  });

  it("détecte localement un nom complet ou un nom de famille dans une question", () => {
    expect(candidateNameIsMentioned("Que propose Marine Le Pen ?", "Marine Le Pen")).toBe(true);
    expect(candidateNameIsMentioned("Le programme de Mélenchon", "Jean-Luc Mélenchon")).toBe(true);
    expect(
      candidateNameIsMentioned("Que propose Philippe Poutou ?", "Édouard Philippe", [
        "Édouard Philippe",
        "Philippe Poutou",
      ])
    ).toBe(false);
    expect(candidateNameIsMentioned("Que proposent les candidats ?", "Marine Le Pen")).toBe(false);
  });

  it("scope l'index et réhydrate en deux requêtes publiques bornées", async () => {
    const result = await searchPresidentialCorpus("presidentielle-test", "logement", 8);

    expect(searchPresidentialPage).toHaveBeenCalledWith({
      query: "logement",
      lexicalQuery: "logement",
      electionId: "election-1",
      limit: 8,
      strategy: "lexical",
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
      url: "/elections/presidentielle-test/mesures/alice-martin-construire-des-logements-publics",
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
    expect(searchPresidentialPage).not.toHaveBeenCalled();
  });

  it("filtre un sous-thème sur son rattachement validé et conserve la pagination", async () => {
    findSubtopic.mockResolvedValue({
      slug: "acces-aux-soins",
      label: "Accès aux soins",
      active: true,
    });
    listMeasures.mockResolvedValue({
      total: 74,
      data: [
        {
          measureId: "measure-subtopic",
          text: "Ouvrir des centres de santé",
          publicUrl: "/elections/presidentielle-test/mesures/ouvrir-des-centres-de-sante",
          candidacy: { candidateName: "Alice Martin", politicianSlug: "alice-martin" },
          theme: { code: "SANTE" },
          precision: { code: null },
          sources: [{ sourceKind: "PROGRAMME_CANDIDAT", url: "https://example.org/programme" }],
        },
      ],
    });

    const result = await searchPresidentialCorpus("presidentielle-test", "", 50, {
      subtopicSlug: "acces-aux-soins",
      page: 2,
    });

    expect(listMeasures).toHaveBeenCalledWith({
      electionId: "election-1",
      electionSlug: "presidentielle-test",
      subtopicSlug: "acces-aux-soins",
      page: 2,
      limit: 50,
    });
    expect(searchPresidentialPage).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      query: "Accès aux soins",
      total: 74,
      page: 2,
      totalPages: 2,
      filter: { type: "subtopic", slug: "acces-aux-soins", label: "Accès aux soins" },
    });
  });

  it("retire la formulation d’une question avant la recherche lexicale", async () => {
    searchPresidentialPage.mockResolvedValue({ strategy: "lexical", total: 0, hits: [] });
    searchPublicPage.mockResolvedValue({ total: 0, hits: [] });

    await searchPresidentialCorpus(
      "presidentielle-test",
      "Que proposent les candidats pour réduire le coût du logement ?",
      8
    );

    expect(searchPresidentialPage).toHaveBeenCalledWith({
      query: "Que proposent les candidats pour réduire le coût du logement ?",
      lexicalQuery: "réduire coût logement",
      electionId: "election-1",
      limit: 8,
      strategy: "lexical",
    });
    expect(searchPublicPage).toHaveBeenCalledWith("Logement et urbanisme", {
      electionId: "election-1",
      limit: 8,
    });
  });

  it("ne mélange aucun repli lexical au benchmark sémantique seul", async () => {
    searchPresidentialPage.mockResolvedValue({ strategy: "semantic", total: 0, hits: [] });

    const result = await searchPresidentialCorpus("presidentielle-test", "Alice Martin", 8, {
      strategy: "semantic",
    });

    expect(searchPublicPage).not.toHaveBeenCalled();
    expect(result).toMatchObject({ total: 0, subjects: [], candidacies: [], measures: [] });
  });

  it("conserve le rang vectoriel entre mesures et candidatures", async () => {
    searchPresidentialPage.mockResolvedValue({
      strategy: "semantic",
      total: 2,
      hits: [
        { entityType: "MEASURE", entityId: "measure-public", title: "Logement", url: "/old" },
        { entityType: "CANDIDACY", entityId: "cand-public", title: "Alice", url: "/old" },
      ],
    });

    const result = await searchPresidentialCorpus("presidentielle-test", "Alice logement", 8, {
      strategy: "semantic",
    });

    expect(result?.rankedResults?.map((item) => item.type)).toEqual(["measure", "candidacy"]);
  });
});
