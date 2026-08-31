import { describe, expect, it, vi } from "vitest";
import { deleteSearchDocuments, upsertSearchDocument, upsertSearchDocuments } from "../documents";

const makeInput = (index: number) => ({
  entityType: "MEASURE" as const,
  entityId: `measure-${index}`,
  electionId: "election-1",
  title: `Mesure ${index}`,
  body: `Contenu ${index}`,
  url: `/mesures/measure-${index}`,
  visibility: "PUBLIC" as const,
  sourceRevisionId: `revision-${index}`,
  sourceUpdatedAt: new Date("2026-08-30T00:00:00.000Z"),
});

describe("écritures groupées des documents de recherche", () => {
  it("invalide le vecteur sémantique avant de modifier le texte indexé", async () => {
    const tx = {
      searchDocument: { upsert: vi.fn(async () => ({ id: "document-1" })) },
      $executeRaw: vi.fn(async () => 0),
    };

    await upsertSearchDocument(tx as never, makeInput(1));

    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    const firstCall = tx.$executeRaw.mock.calls[0] as unknown as [TemplateStringsArray];
    expect(firstCall[0].join("?")).toContain('DELETE FROM "SearchEmbedding"');
  });

  it("borne chaque lot à cent documents", async () => {
    const tx = {
      searchDocument: { createMany: vi.fn(async (_args: { data: unknown[] }) => ({ count: 0 })) },
      $executeRaw: vi.fn(async () => 0),
    };

    await upsertSearchDocuments(
      tx as never,
      Array.from({ length: 101 }, (_, index) => makeInput(index))
    );

    expect(tx.searchDocument.createMany).toHaveBeenCalledTimes(2);
    expect(tx.searchDocument.createMany.mock.calls[0]?.[0]?.data).toHaveLength(100);
    expect(tx.searchDocument.createMany.mock.calls[1]?.[0]?.data).toHaveLength(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(4);
  });

  it("type explicitement les dates du VALUES utilisé par PostgreSQL", async () => {
    const tx = {
      searchDocument: { createMany: vi.fn(async () => ({ count: 0 })) },
      $executeRaw: vi.fn(async () => 0),
    };

    await upsertSearchDocuments(tx as never, [makeInput(1)]);

    const calls = tx.$executeRaw.mock.calls as unknown as Array<[{ strings: string[] }]>;
    const query = calls[1]![0];
    expect(query.strings.join("?").match(/::timestamp/g)).toHaveLength(2);
  });

  it("supprime plusieurs documents en une seule requête", async () => {
    const tx = { searchDocument: { deleteMany: vi.fn(async () => ({ count: 2 })) } };

    await deleteSearchDocuments(tx as never, "MEASURE", ["measure-1", "measure-2"]);

    expect(tx.searchDocument.deleteMany).toHaveBeenCalledWith({
      where: { entityType: "MEASURE", entityId: { in: ["measure-1", "measure-2"] } },
    });
  });
});
