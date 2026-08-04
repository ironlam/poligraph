import type { SearchEntityType, SearchVisibility } from "@/generated/prisma";
import type { DbTransactionClient } from "@/lib/db";

export type SearchDocumentInput = {
  entityType: SearchEntityType;
  entityId: string;
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
 * from the generated client. The second one recomputes both derived columns from the
 * row's own title and body, so searchText can never disagree with the indexed text.
 */
export async function upsertSearchDocument(
  tx: DbTransactionClient,
  input: SearchDocumentInput
): Promise<void> {
  const scalars = {
    title: input.title,
    body: input.body,
    url: input.url,
    visibility: input.visibility,
    sourceRevisionId: input.sourceRevisionId,
    sourceUpdatedAt: input.sourceUpdatedAt,
    indexedAt: new Date(),
  };

  await tx.searchDocument.upsert({
    where: { entityType_entityId: { entityType: input.entityType, entityId: input.entityId } },
    create: { entityType: input.entityType, entityId: input.entityId, ...scalars },
    update: scalars,
  });

  await tx.$executeRaw`
    UPDATE "SearchDocument"
    SET "searchVector" = to_tsvector('simple', unaccent(title || ' ' || body)),
        "searchText"   = lower(unaccent(title || ' ' || body))
    WHERE "entityType" = ${input.entityType}::"SearchEntityType"
      AND "entityId" = ${input.entityId}
  `;
}
