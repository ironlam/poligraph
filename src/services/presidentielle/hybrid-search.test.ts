import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchHit } from "@/lib/search/query";

const queryRaw = vi.fn();
const callMistralEmbeddings = vi.fn();
const searchPublicPage = vi.fn();

vi.mock("@/lib/db", () => ({ db: { $queryRaw: (...args: unknown[]) => queryRaw(...args) } }));
vi.mock("@/lib/api/mistral", () => ({
  callMistralEmbeddings: (...args: unknown[]) => callMistralEmbeddings(...args),
}));
vi.mock("@/lib/search/query", () => ({
  searchPublicPage: (...args: unknown[]) => searchPublicPage(...args),
}));

import {
  fusePresidentialSearchHits,
  searchPresidentialPage,
} from "@/services/presidentielle/hybrid-search";

const hit = (entityId: string, title = entityId): SearchHit => ({
  entityType: "MEASURE",
  entityId,
  title,
  url: `/mesures/${entityId}`,
});

describe("recherche hybride présidentielle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchPublicPage.mockResolvedValue({ hits: [hit("lexical")], total: 1 });
    callMistralEmbeddings.mockResolvedValue({
      model: "mistral-embed",
      data: [{ index: 0, embedding: Array(1024).fill(0.1) }],
    });
    queryRaw.mockResolvedValue([{ ...hit("semantic"), similarity: 0.8 }]);
  });

  it("récompense l'accord des deux classements et déduplique les résultats", () => {
    expect(
      fusePresidentialSearchHits(
        "coût du logement",
        [hit("lexical"), hit("shared")],
        [hit("shared"), hit("semantic")],
        10
      ).map((item) => item.entityId)
    ).toEqual(["shared", "lexical", "semantic"]);
  });

  it("conserve un titre exact devant la fusion", () => {
    expect(
      fusePresidentialSearchHits(
        "Marine Le Pen",
        [hit("other"), hit("candidate", "Marine Le Pen")],
        [hit("other")],
        10
      )[0]?.entityId
    ).toBe("candidate");
  });

  it("n'appelle pas Mistral pour la stratégie lexicale", async () => {
    const result = await searchPresidentialPage({
      electionId: "election-1",
      query: "logement",
      lexicalQuery: "logement",
      limit: 8,
      strategy: "lexical",
    });
    expect(result.strategy).toBe("lexical");
    expect(callMistralEmbeddings).not.toHaveBeenCalled();
  });

  it("isole les résultats sémantiques pour mesurer leur apport", async () => {
    const result = await searchPresidentialPage({
      electionId: "election-1",
      query: "réduire la fracture médicale",
      limit: 8,
      strategy: "semantic",
    });
    expect(searchPublicPage).not.toHaveBeenCalled();
    expect(result).toMatchObject({ strategy: "semantic", total: 1 });
    expect(result.hits.map((item) => item.entityId)).toEqual(["semantic"]);
  });

  it("fusionne les résultats après un seul embedding de requête", async () => {
    const result = await searchPresidentialPage({
      electionId: "election-1",
      query: "faire baisser les loyers",
      lexicalQuery: "baisser loyers",
      limit: 8,
      strategy: "hybrid",
    });
    expect(callMistralEmbeddings).toHaveBeenCalledTimes(1);
    expect(searchPublicPage).toHaveBeenCalledWith("baisser loyers", {
      electionId: "election-1",
      limit: 8,
    });
    expect(result).toMatchObject({
      strategy: "hybrid",
      total: 2,
      semanticMaxSimilarity: 0.8,
    });
    expect(result.hits.map((item) => item.entityId)).toEqual(["lexical", "semantic"]);
  });

  it("revient aux résultats lexicaux si Mistral est indisponible", async () => {
    callMistralEmbeddings.mockRejectedValue(new Error("quota"));
    const result = await searchPresidentialPage({
      electionId: "election-1",
      query: "déserts médicaux",
      limit: 8,
      strategy: "hybrid",
    });
    expect(result).toMatchObject({ strategy: "lexical-fallback", total: 1 });
    expect(result.hits.map((item) => item.entityId)).toEqual(["lexical"]);
  });

  it("écarte un voisin sémantique sous le seuil tout en conservant le diagnostic", async () => {
    queryRaw.mockResolvedValue([{ ...hit("unrelated"), similarity: 0.42 }]);
    const result = await searchPresidentialPage({
      electionId: "election-1",
      query: "xylophone",
      limit: 8,
      strategy: "hybrid",
    });
    expect(result.hits.map((item) => item.entityId)).toEqual(["lexical"]);
    expect(result.semanticMaxSimilarity).toBe(0.42);
  });
});
