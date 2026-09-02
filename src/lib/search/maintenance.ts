import type { SearchEntityType } from "@/generated/prisma";
import { db } from "@/lib/db";
import { lockMeasure, lockMeasureCandidacy } from "@/lib/measures/lock";
import { syncSearchDocument } from "@/lib/measures/search-sync";
import { syncCandidacySearchDocument } from "@/lib/presidentielle/search-sync";

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
 * Lot 1B refused to write this registry when it would have been empty, which was right. It is now
 * the thing
 * that lets `search:audit` say "this document has a type nobody indexes" instead of ignoring it.
 */
export type ReindexableSearchEntityType = Extract<SearchEntityType, "CANDIDACY" | "MEASURE">;

type Indexable = {
  label: string;
  existingIds: (ids: string[]) => Promise<Set<string>>;
  nextIds: (
    after: string | undefined,
    take: number,
    electionSlug: string | undefined
  ) => Promise<string[]>;
  sync: (entityId: string) => Promise<void>;
};

const INDEXABLE: Record<ReindexableSearchEntityType, Indexable> = {
  CANDIDACY: {
    label: "candidatures",
    existingIds: async (ids) => {
      const rows = await db.candidacy.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      return new Set(rows.map((row) => row.id));
    },
    nextIds: async (after, take, electionSlug) => {
      const rows = await db.candidacy.findMany({
        where: {
          ...(after ? { id: { gt: after } } : {}),
          ...(electionSlug ? { election: { slug: electionSlug } } : {}),
        },
        orderBy: { id: "asc" },
        take,
        select: { id: true },
      });
      return rows.map((row) => row.id);
    },
    sync: async (entityId) => {
      await db.$transaction(async (tx) => {
        await lockMeasureCandidacy(tx, entityId);
        await syncCandidacySearchDocument(tx, entityId);
      });
    },
  },
  MEASURE: {
    label: "mesures",
    existingIds: async (ids) => {
      const rows = await db.measure.findMany({ where: { id: { in: ids } }, select: { id: true } });
      return new Set(rows.map((row) => row.id));
    },
    nextIds: async (after, take, electionSlug) => {
      const rows = await db.measure.findMany({
        where: {
          ...(after ? { id: { gt: after } } : {}),
          ...(electionSlug ? { election: { slug: electionSlug } } : {}),
        },
        orderBy: { id: "asc" },
        take,
        select: { id: true },
      });
      return rows.map((row) => row.id);
    },
    sync: async (entityId) => {
      await db.$transaction(async (tx) => {
        // Match the transition lock order so a maintenance rebuild cannot overwrite a publication
        // document derived from a newer measure or candidacy state.
        await lockMeasure(tx, entityId);
        const measure = await tx.measure.findUnique({
          where: { id: entityId },
          select: { candidacyId: true },
        });
        if (measure?.candidacyId) await lockMeasureCandidacy(tx, measure.candidacyId);
        await syncSearchDocument(tx, entityId);
      });
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

  const documentIdsByType = new Map<string, string[]>();
  for (const document of documents) {
    const ids = documentIdsByType.get(document.entityType) ?? [];
    ids.push(document.entityId);
    documentIdsByType.set(document.entityType, ids);
  }

  const existing = new Map<string, Set<string>>();
  for (const type of KNOWN_TYPES) {
    const documentIds = documentIdsByType.get(type) ?? [];
    const ids = new Set<string>();
    // Audit only entities referenced by the index. Enumerating every candidacy would load the
    // 500k+ municipal corpus to validate a handful of presidential documents.
    for (let offset = 0; offset < documentIds.length; offset += 500) {
      const found = await INDEXABLE[type].existingIds(documentIds.slice(offset, offset + 500));
      for (const id of found) ids.add(id);
    }
    existing.set(type, ids);
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

export type ReindexResult = {
  entityType: ReindexableSearchEntityType;
  processed: number;
  batches: number;
  lastId: string | null;
};

export type ReindexOptions = {
  /** Exclusive cursor. The next batch starts with ids greater than this value. */
  after?: string;
  /** Bounds memory and query size. Values outside 1..1000 are clamped. */
  batchSize?: number;
  /** Optional election boundary, resolved through the entity's Election relation. */
  electionSlug?: string;
  onBatch?: (progress: ReindexResult) => void;
};

function boundedBatchSize(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 100;
  return Math.min(Math.max(Math.trunc(value), 1), 1000);
}

/**
 * Rebuild one entity family in stable id order, using bounded reads and one transaction per entity.
 * The cursor is logged after a whole batch succeeds, so an interrupted run can safely resume from it.
 */
export async function reindexSearchEntityType(
  entityType: ReindexableSearchEntityType,
  options: ReindexOptions = {}
): Promise<ReindexResult> {
  const indexer = INDEXABLE[entityType];
  const batchSize = boundedBatchSize(options.batchSize);
  let cursor = options.after;
  let processed = 0;
  let batches = 0;

  while (true) {
    const ids = await indexer.nextIds(cursor, batchSize, options.electionSlug);
    if (ids.length === 0) break;

    for (const id of ids) await indexer.sync(id);

    cursor = ids.at(-1);
    processed += ids.length;
    batches += 1;
    options.onBatch?.({ entityType, processed, batches, lastId: cursor ?? null });
  }

  return { entityType, processed, batches, lastId: cursor ?? null };
}

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
export async function reindexMeasures(options: ReindexOptions = {}): Promise<ReindexResult> {
  return reindexSearchEntityType("MEASURE", options);
}
