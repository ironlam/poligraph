import { beforeEach, describe, expect, it, vi } from "vitest";
import { PRESIDENTIAL_SEARCH_EMBEDDING_DIMENSIONS } from "@/config/presidential-search-embedding";

const mocks = vi.hoisted(() => ({
  findElection: vi.fn(),
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
  transaction: vi.fn(),
  callMistralEmbeddings: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    election: { findUnique: mocks.findElection },
    $queryRaw: mocks.queryRaw,
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/api/mistral", () => ({
  callMistralEmbeddings: mocks.callMistralEmbeddings,
}));

import {
  buildSearchEmbeddingContent,
  embedPresidentialSearchDocuments,
  hashSearchEmbeddingContent,
  validateMistralEmbeddingBatch,
} from "@/services/presidentielle/search-embeddings";

function sourceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "document-1",
    title: "Encadrer les loyers",
    body: "Mesure publiée",
    sourceUpdatedAt: new Date("2026-08-30T12:00:00Z"),
    embeddingModel: null,
    embeddingDimensions: null,
    embeddingContentHash: null,
    embeddingSourceUpdatedAt: null,
    ...overrides,
  };
}

describe("index sémantique présidentiel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findElection.mockResolvedValue({ id: "election-1" });
    mocks.transaction.mockImplementation(
      async (callback: (tx: { $executeRaw: typeof mocks.executeRaw }) => Promise<void>) =>
        callback({ $executeRaw: mocks.executeRaw })
    );
  });

  it("construit un contenu borné et un hash déterministe", () => {
    const content = buildSearchEmbeddingContent(
      "  Encadrer les loyers ",
      `\n${"texte ".repeat(200)}`
    );
    expect(content.length).toBeGreaterThan(490);
    expect(content.length).toBeLessThanOrEqual(500);
    expect(content).not.toMatch(/\s{2,}/);
    expect(hashSearchEmbeddingContent(content)).toBe(hashSearchEmbeddingContent(content));
    expect(hashSearchEmbeddingContent(`${content}x`)).not.toBe(hashSearchEmbeddingContent(content));
  });

  it("ne répète pas un titre déjà présent au début du corps", () => {
    expect(
      buildSearchEmbeddingContent("Encadrer les loyers", "Encadrer les loyers dans les métropoles")
    ).toBe("Encadrer les loyers dans les métropoles");
  });

  it("préserve les termes structurés ajoutés après un corps long", () => {
    const content = buildSearchEmbeddingContent(
      "Encadrer les loyers",
      `${"détail documentaire ".repeat(80)}\n\nGabriel Attal\n\nRenaissance\n\nLogement et urbanisme\n\nEncadrement des loyers`
    );

    expect(content).toContain("Gabriel Attal");
    expect(content).toContain("Renaissance");
    expect(content).toContain("Logement et urbanisme");
    expect(content).toContain("Encadrement des loyers");
    expect(content.length).toBeLessThanOrEqual(500);
  });

  it("réordonne les vecteurs et refuse une dimension inattendue", () => {
    const first = Array(PRESIDENTIAL_SEARCH_EMBEDDING_DIMENSIONS).fill(0.1);
    const second = Array(PRESIDENTIAL_SEARCH_EMBEDDING_DIMENSIONS).fill(0.2);
    expect(
      validateMistralEmbeddingBatch(
        [
          { index: 1, embedding: second },
          { index: 0, embedding: first },
        ],
        2
      )
    ).toEqual([first, second]);
    expect(() => validateMistralEmbeddingBatch([{ index: 0, embedding: [0.1] }], 1)).toThrow(
      "1024"
    );
  });

  it("reste strictement sans appel Mistral ni écriture en simulation", async () => {
    mocks.queryRaw.mockResolvedValueOnce([sourceRow()]);

    const result = await embedPresidentialSearchDocuments({
      electionSlug: "presidentielle-2027",
      entityType: "MEASURE",
      limit: 1,
      dryRun: true,
    });

    expect(result).toMatchObject({ scanned: 1, embedded: 1, skippedFresh: 0, dryRun: true });
    expect(mocks.callMistralEmbeddings).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("ignore un document déjà à jour en mode différentiel", async () => {
    const sourceUpdatedAt = new Date("2026-08-30T12:00:00Z");
    const content = buildSearchEmbeddingContent("Encadrer les loyers", "Mesure publiée");
    mocks.queryRaw.mockResolvedValueOnce([
      sourceRow({
        sourceUpdatedAt,
        embeddingModel: "mistral-embed",
        embeddingDimensions: PRESIDENTIAL_SEARCH_EMBEDDING_DIMENSIONS,
        embeddingContentHash: hashSearchEmbeddingContent(content),
        embeddingSourceUpdatedAt: sourceUpdatedAt,
      }),
    ]);

    const result = await embedPresidentialSearchDocuments({
      electionSlug: "presidentielle-2027",
      entityType: "MEASURE",
      limit: 1,
    });

    expect(result).toMatchObject({ scanned: 1, embedded: 0, skippedFresh: 1 });
    expect(mocks.callMistralEmbeddings).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("écrit seulement après validation complète du vecteur", async () => {
    mocks.queryRaw.mockResolvedValueOnce([sourceRow()]);
    mocks.callMistralEmbeddings.mockResolvedValue({
      data: [
        {
          index: 0,
          embedding: Array(PRESIDENTIAL_SEARCH_EMBEDDING_DIMENSIONS).fill(0.1),
        },
      ],
    });

    const result = await embedPresidentialSearchDocuments({
      electionSlug: "presidentielle-2027",
      entityType: "MEASURE",
      limit: 1,
    });

    expect(result.embedded).toBe(1);
    expect(mocks.callMistralEmbeddings).toHaveBeenCalledOnce();
    expect(mocks.executeRaw).toHaveBeenCalledOnce();
  });
});
