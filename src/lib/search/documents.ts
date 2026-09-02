import { Prisma, type SearchEntityType, type SearchVisibility } from "@/generated/prisma";
import type { DbTransactionClient } from "@/lib/db";

export type SearchDocumentInput = {
  entityType: SearchEntityType;
  entityId: string;
  /** Structured election scope. Required here even though null is valid for global entities. */
  electionId: string | null;
  title: string;
  body: string;
  url: string;
  visibility: SearchVisibility;
  /** Opaque: the revision this document represents, or null for revisionless entities. */
  sourceRevisionId: string | null;
  /** The entity's updatedAt at indexing time. */
  sourceUpdatedAt: Date;
};

/**
 * The only authorized way to write a SearchDocument.
 *
 * Takes the caller's transaction client and never opens a transaction: the atomicity
 * requirement of spec 7.2 belongs to the caller, which knows what else has to succeed
 * or fail with the indexing.
 *
 * Two statements because searchVector is Unsupported("tsvector") and therefore absent
 * from the generated client. The second one recomputes the vector from the row's own
 * title and body rather than from the input, so the index can never disagree with the
 * text stored next to it.
 */
export async function upsertSearchDocument(
  tx: DbTransactionClient,
  input: SearchDocumentInput
): Promise<void> {
  const scalars = {
    electionId: input.electionId,
    title: input.title,
    body: input.body,
    url: input.url,
    visibility: input.visibility,
    sourceRevisionId: input.sourceRevisionId,
    sourceUpdatedAt: input.sourceUpdatedAt,
    indexedAt: new Date(),
  };

  // A semantic vector describes title + body, not only the source revision timestamp. Editorial
  // enrichments such as an approved reader guide can change that text without rewriting the
  // revision. Delete the old vector in the same transaction so hybrid search cannot treat it as
  // current until the embedding worker rebuilds it.
  await tx.$executeRaw`
    DELETE FROM "SearchEmbedding" AS embedding
    USING "SearchDocument" AS document
    WHERE embedding."searchDocumentId" = document.id
      AND document."entityType" = ${input.entityType}::"SearchEntityType"
      AND document."entityId" = ${input.entityId}
      AND (
        document.title IS DISTINCT FROM ${input.title}
        OR document.body IS DISTINCT FROM ${input.body}
      )
  `;

  await tx.searchDocument.upsert({
    where: { entityType_entityId: { entityType: input.entityType, entityId: input.entityId } },
    create: { entityType: input.entityType, entityId: input.entityId, ...scalars },
    update: scalars,
  });

  await tx.$executeRaw`
    UPDATE "SearchDocument"
    SET "searchVector" = to_tsvector('simple', unaccent(title || ' ' || body))
    WHERE "entityType" = ${input.entityType}::"SearchEntityType"
      AND "entityId" = ${input.entityId}
  `;
}

const BULK_WRITE_SIZE = 100;

/**
 * Writes search documents in bounded SQL batches.
 *
 * `createMany` lets PostgreSQL allocate ids for new rows. The following UPDATE applies the full
 * payload to both new and existing rows and rebuilds their vectors in the same statement. This
 * keeps large editorial mutations inside their transaction without two round trips per entity.
 */
export async function upsertSearchDocuments(
  tx: DbTransactionClient,
  inputs: SearchDocumentInput[]
): Promise<void> {
  for (let start = 0; start < inputs.length; start += BULK_WRITE_SIZE) {
    const chunk = inputs.slice(start, start + BULK_WRITE_SIZE);
    const indexedAt = new Date();

    await tx.searchDocument.createMany({
      data: chunk.map((input) => ({
        entityType: input.entityType,
        entityId: input.entityId,
        electionId: input.electionId,
        title: input.title,
        body: input.body,
        url: input.url,
        visibility: input.visibility,
        sourceRevisionId: input.sourceRevisionId,
        sourceUpdatedAt: input.sourceUpdatedAt,
        indexedAt,
      })),
      skipDuplicates: true,
    });

    const rows = Prisma.join(
      chunk.map(
        (input) => Prisma.sql`(
          ${input.entityType}::"SearchEntityType",
          ${input.entityId},
          ${input.electionId},
          ${input.title},
          ${input.body},
          ${input.url},
          ${input.visibility}::"SearchVisibility",
          ${input.sourceRevisionId},
          ${input.sourceUpdatedAt}::timestamp,
          ${indexedAt}::timestamp
        )`
      )
    );

    await tx.$executeRaw(Prisma.sql`
      DELETE FROM "SearchEmbedding" AS embedding
      USING "SearchDocument" AS document,
        (VALUES ${rows}) AS source(
          "entityType",
          "entityId",
          "electionId",
          title,
          body,
          url,
          visibility,
          "sourceRevisionId",
          "sourceUpdatedAt",
          "indexedAt"
        )
      WHERE embedding."searchDocumentId" = document.id
        AND document."entityType" = source."entityType"
        AND document."entityId" = source."entityId"
        AND (
          document.title IS DISTINCT FROM source.title
          OR document.body IS DISTINCT FROM source.body
        )
    `);

    await tx.$executeRaw(Prisma.sql`
      UPDATE "SearchDocument" AS document
      SET
        "electionId" = source."electionId",
        title = source.title,
        body = source.body,
        url = source.url,
        visibility = source.visibility,
        "sourceRevisionId" = source."sourceRevisionId",
        "sourceUpdatedAt" = source."sourceUpdatedAt",
        "indexedAt" = source."indexedAt",
        "searchVector" = to_tsvector('simple', unaccent(source.title || ' ' || source.body))
      FROM (VALUES ${rows}) AS source(
        "entityType",
        "entityId",
        "electionId",
        title,
        body,
        url,
        visibility,
        "sourceRevisionId",
        "sourceUpdatedAt",
        "indexedAt"
      )
      WHERE document."entityType" = source."entityType"
        AND document."entityId" = source."entityId"
    `);
  }
}

/**
 * Entity deletion path, and the only one that removes a row.
 *
 * A depublication is NOT a deletion: it is an upsert with ADMIN_ONLY visibility, which
 * keeps the indexed text so bringing the entity back needs no reindex (spec 7.2).
 *
 * deleteMany and not delete: deleting an entity that was never indexed is an ordinary
 * case, not an error, and delete would raise P2025.
 */
export async function deleteSearchDocument(
  tx: DbTransactionClient,
  entityType: SearchEntityType,
  entityId: string
): Promise<void> {
  await tx.searchDocument.deleteMany({ where: { entityType, entityId } });
}

export async function deleteSearchDocuments(
  tx: DbTransactionClient,
  entityType: SearchEntityType,
  entityIds: string[]
): Promise<void> {
  if (entityIds.length === 0) return;
  await tx.searchDocument.deleteMany({ where: { entityType, entityId: { in: entityIds } } });
}
