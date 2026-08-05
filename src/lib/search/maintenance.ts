import type { SearchEntityType } from "@/generated/prisma";
import { db } from "@/lib/db";
import { syncSearchDocument } from "@/lib/measures/search-sync";

/**
 * Maintenance of the search index: rebuilding it, and auditing what the substrate can see by itself.
 *
 * **What this audit deliberately does NOT check.** Whether a document's visibility matches its
 * entity's publication state, and whether it points at the right revision, both need to know what a
 * `Measure` is. Those three rules live in `measures:audit`, which knows. Duplicating them here would
 * give two implementations of one policy, and the substrate is entity-agnostic on purpose (spec 13.1).
 *
 * What is left for this command is exactly what the substrate CAN answer: a document whose entity no
 * longer exists, and a document of a type nothing knows how to index.
 */

/**
 * The entity types something knows how to index, with how to enumerate them.
 *
 * One entry today. Lot 1B refused to write this registry when it would have been empty, which was
 * right: a registry with no entries is speculative generality. With one real entry it is the thing
 * that lets `search:audit` say "this document has a type nobody indexes" instead of ignoring it.
 */
const INDEXABLE: Record<
  Extract<SearchEntityType, "MEASURE">,
  { label: string; existingIds: () => Promise<Set<string>> }
> = {
  MEASURE: {
    label: "mesures",
    existingIds: async () => {
      const rows = await db.measure.findMany({ select: { id: true } });
      return new Set(rows.map((row) => row.id));
    },
  },
};

const KNOWN_TYPES = Object.keys(INDEXABLE) as (keyof typeof INDEXABLE)[];

export type SearchAuditViolation = {
  rule: "document_without_entity" | "document_of_unknown_type";
  entityType: string;
  entityId: string;
};

export async function auditSearchDocuments(): Promise<SearchAuditViolation[]> {
  const violations: SearchAuditViolation[] = [];

  const documents = await db.searchDocument.findMany({
    select: { entityType: true, entityId: true },
  });

  const existing = new Map<string, Set<string>>();
  for (const type of KNOWN_TYPES) {
    existing.set(type, await INDEXABLE[type].existingIds());
  }

  for (const document of documents) {
    const known = existing.get(document.entityType);
    if (known === undefined) {
      // Not a failure of the index: a type nothing enumerates cannot be rebuilt or checked, so it
      // would rot silently. Saying so is the whole point of having a registry.
      violations.push({
        rule: "document_of_unknown_type",
        entityType: document.entityType,
        entityId: document.entityId,
      });
      continue;
    }
    if (!known.has(document.entityId)) {
      violations.push({
        rule: "document_without_entity",
        entityType: document.entityType,
        entityId: document.entityId,
      });
    }
  }

  return violations;
}

export type ReindexResult = { entityType: string; processed: number };

/**
 * Rebuilds every measure's document from its pointers.
 *
 * Idempotent by construction: it calls the same `syncSearchDocument()` the transitions call, which
 * derives the document rather than patching it. Running it twice changes nothing the second time.
 *
 * One transaction per measure, not one for the whole run: a single transaction over the entire table
 * would hold locks for as long as the rebuild takes, and a failure in the middle would roll back work
 * that was correct.
 */
export async function reindexMeasures(): Promise<ReindexResult> {
  const measures = await db.measure.findMany({ select: { id: true } });

  for (const measure of measures) {
    await db.$transaction(async (tx) => {
      await syncSearchDocument(tx, measure.id);
    });
  }

  return { entityType: "MEASURE", processed: measures.length };
}
