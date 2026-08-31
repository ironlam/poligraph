import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { PRESIDENTIAL_SEARCH_EMBEDDING_DIMENSIONS } from "@/config/presidential-search-embedding";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import { uniqueEntityId } from "./helpers";

let db: typeof import("@/lib/db").db;

describeIfDisposableDb("SearchEmbedding pgvector", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    vi.doMock("@/lib/api/mistral", () => ({
      callMistralEmbeddings: vi.fn(async (inputs: string[]) => ({
        model: "mistral-embed",
        data: inputs.map((_, index) => ({
          index,
          embedding: Array(PRESIDENTIAL_SEARCH_EMBEDDING_DIMENSIONS).fill(0.1),
        })),
        usage: { prompt_tokens: inputs.length, total_tokens: inputs.length },
      })),
    }));
    ({ db } = await import("@/lib/db"));
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("écrit un vecteur Mistral et le remplace sans doublon", async () => {
    const suffix = uniqueEntityId("semantic");
    const election = await db.election.create({
      data: {
        slug: `presidentielle-${suffix}`,
        type: "PRESIDENTIELLE",
        scope: "NATIONAL",
        title: "Présidentielle de test",
      },
    });
    const entityId = uniqueEntityId("measure");
    const sourceUpdatedAt = new Date("2026-08-30T12:00:00Z");

    try {
      const { upsertSearchDocument } = await import("@/lib/search/documents");
      const { embedPresidentialSearchDocuments } =
        await import("@/services/presidentielle/search-embeddings");
      await db.$transaction((tx) =>
        upsertSearchDocument(tx, {
          entityType: "MEASURE",
          entityId,
          electionId: election.id,
          title: "Encadrer les loyers",
          body: "Plafonner les loyers dans les zones tendues.",
          url: `/mesures/${entityId}`,
          visibility: "PUBLIC",
          sourceRevisionId: "revision-1",
          sourceUpdatedAt,
        })
      );

      const first = await embedPresidentialSearchDocuments({
        electionSlug: election.slug,
        entityType: "MEASURE",
        limit: 10,
      });
      const second = await embedPresidentialSearchDocuments({
        electionSlug: election.slug,
        entityType: "MEASURE",
        limit: 10,
      });
      const rows = await db.$queryRaw<
        Array<{ model: string; dimensions: number; vectorDimensions: number }>
      >`
        SELECT model, dimensions, extensions.vector_dims(embedding)::integer AS "vectorDimensions"
        FROM "SearchEmbedding"
        WHERE "searchDocumentId" = (
          SELECT id FROM "SearchDocument"
          WHERE "entityType" = 'MEASURE'::"SearchEntityType" AND "entityId" = ${entityId}
        )
      `;

      expect(first).toMatchObject({ embedded: 1, skippedFresh: 0 });
      expect(second).toMatchObject({ embedded: 0, skippedFresh: 1 });
      expect(rows).toEqual([
        {
          model: "mistral-embed",
          dimensions: PRESIDENTIAL_SEARCH_EMBEDDING_DIMENSIONS,
          vectorDimensions: PRESIDENTIAL_SEARCH_EMBEDDING_DIMENSIONS,
        },
      ]);

      const { searchPresidentialPage } = await import("@/services/presidentielle/hybrid-search");
      const hybrid = await searchPresidentialPage({
        electionId: election.id,
        query: "réduire le coût du logement",
        lexicalQuery: "termes absents du document",
        limit: 10,
        strategy: "hybrid",
      });
      expect(hybrid.strategy).toBe("hybrid");
      expect(hybrid.hits.map((hit) => hit.entityId)).toContain(entityId);

      await db.searchDocument.update({
        where: { entityType_entityId: { entityType: "MEASURE", entityId } },
        data: { visibility: "ADMIN_ONLY" },
      });
      const afterDepublication = await searchPresidentialPage({
        electionId: election.id,
        query: "réduire le coût du logement",
        lexicalQuery: "termes absents du document",
        limit: 10,
        strategy: "hybrid",
      });
      expect(afterDepublication.hits.map((hit) => hit.entityId)).not.toContain(entityId);
    } finally {
      await db.searchDocument.deleteMany({ where: { entityType: "MEASURE", entityId } });
      await db.election.delete({ where: { id: election.id } });
    }
  });
});
