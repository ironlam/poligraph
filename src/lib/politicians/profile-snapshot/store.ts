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
 * Upserts the document unless the stored one was built later.
 *
 * `builtAt` is when the build started, so a slow build that read older data cannot overwrite a
 * faster one that started after it. `written` says whether a row was inserted or updated;
 * `changed` whether its content hash differs from the row it replaced. A first insert is never a
 * change: the backfill would otherwise invalidate every live page it fills.
 *
 * The previous hash is read `FOR UPDATE` in the same transaction: a snapshot read could predate a
 * concurrent writer's commit, report "unchanged" against content that is no longer stored, and
 * skip an invalidation no later refresh would make up for.
 */
export async function writeProfileSnapshot(input: {
  politicianId: string;
  document: PoliticianProfileDocument;
  startedAt: Date;
}): Promise<{ written: boolean; changed: boolean }> {
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
    // A first insert is not a change: no live page was built from this document yet.
    return {
      written,
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
