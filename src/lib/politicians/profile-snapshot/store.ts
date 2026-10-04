import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import {
  PENDING_INVALIDATION_HASH,
  PROFILE_SNAPSHOT_VERSION,
  hashSerializedDocument,
  serializeProfileDocument,
  type PoliticianProfileDocument,
} from "./document";

/**
 * The database clock, truncated to the millisecond `builtAt` stores. Builds take their start
 * from here, so ordering between builds never depends on the clocks of the servers that ran
 * them, and the value read here is the one stored, exactly.
 */
export async function readDatabaseNow(): Promise<Date> {
  const rows = await db.$queryRaw<Array<{ now: Date }>>(
    Prisma.sql`SELECT date_trunc('milliseconds', clock_timestamp()) AS "now"`
  );
  return rows[0]!.now;
}

/**
 * Upserts the document unless the stored one was built later.
 *
 * `builtAt` is when the build started, so a slow build that read older data cannot overwrite a
 * faster one that started after it. `written` says whether a row was inserted or updated;
 * `inserted` whether no row existed before this write; `changed` whether its content hash differs
 * from the row it replaced, so a first insert is never a change. Callers that invalidate pages
 * must treat an insert as one too: a page cached while the politician was not public (a cached
 * `null`) has no row to compare against.
 *
 * The previous hash is read `FOR UPDATE` in the same transaction: a snapshot read could predate a
 * concurrent writer's commit, report "unchanged" against content that is no longer stored, and
 * skip an invalidation no later refresh would make up for.
 */
export async function writeProfileSnapshot(input: {
  politicianId: string;
  document: PoliticianProfileDocument;
  startedAt: Date;
}): Promise<{ written: boolean; inserted: boolean; changed: boolean }> {
  const data = serializeProfileDocument(input.document);
  const contentHash = hashSerializedDocument(data);

  return db.$transaction(async (tx) => {
    const prev = await tx.$queryRaw<Array<{ contentHash: string }>>(Prisma.sql`
      SELECT "contentHash" FROM "PoliticianProfileSnapshot"
      WHERE "politicianId" = ${input.politicianId}
      FOR UPDATE
    `);
    const up = await tx.$queryRaw<unknown[]>(Prisma.sql`
      INSERT INTO "PoliticianProfileSnapshot"
        ("id", "politicianId", "version", "data", "contentHash", "builtAt")
      VALUES (
        ${randomUUID()},
        ${input.politicianId},
        ${PROFILE_SNAPSHOT_VERSION},
        ${JSON.stringify(data)}::jsonb,
        ${contentHash},
        ${input.startedAt}::timestamp
      )
      ON CONFLICT ("politicianId") DO UPDATE SET
        "version" = EXCLUDED."version",
        "data" = EXCLUDED."data",
        "contentHash" = EXCLUDED."contentHash",
        "builtAt" = EXCLUDED."builtAt"
      WHERE "PoliticianProfileSnapshot"."builtAt" < EXCLUDED."builtAt"
      RETURNING 1
    `);
    const written = up.length > 0;
    return {
      written,
      inserted: written && prev.length === 0,
      changed: written && prev.length > 0 && prev[0]!.contentHash !== contentHash,
    };
  });
}

// Defined next to the hash so the read-only audit can import it without a database client.
export { PENDING_INVALIDATION_HASH };

/**
 * Replaces the stored hash with PENDING_INVALIDATION_HASH, only while the row is still the one
 * written by the build that started at `builtAt`: a later build already compared against the
 * right hash and owns the invalidation. Returns whether the row was marked.
 */
export async function markProfileSnapshotPendingInvalidation(input: {
  politicianId: string;
  builtAt: Date;
}): Promise<boolean> {
  const count = await db.$executeRaw(Prisma.sql`
    UPDATE "PoliticianProfileSnapshot"
    SET "contentHash" = ${PENDING_INVALIDATION_HASH}
    WHERE "politicianId" = ${input.politicianId}
      AND "builtAt" = ${input.builtAt}::timestamp
  `);
  return count > 0;
}

/** Slug of the stored document, when one exists that was built before `before`. */
export async function readStoredProfileSlug(input: {
  politicianId: string;
  before: Date;
}): Promise<string | null> {
  const rows = await db.$queryRaw<Array<{ slug: string | null }>>(Prisma.sql`
    SELECT "data"->'identity'->>'slug' AS "slug" FROM "PoliticianProfileSnapshot"
    WHERE "politicianId" = ${input.politicianId}
      AND "builtAt" < ${input.before}::timestamp
  `);
  return rows[0]?.slug ?? null;
}

/**
 * Deletes the stored document unless a build that started at or after `before` wrote it.
 * Returns whether a row was deleted.
 */
export async function deleteProfileSnapshotBuiltBefore(input: {
  politicianId: string;
  before: Date;
}): Promise<boolean> {
  const count = await db.$executeRaw(Prisma.sql`
    DELETE FROM "PoliticianProfileSnapshot"
    WHERE "politicianId" = ${input.politicianId}
      AND "builtAt" < ${input.before}::timestamp
  `);
  return count > 0;
}
