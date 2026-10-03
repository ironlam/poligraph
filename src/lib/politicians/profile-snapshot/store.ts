import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import {
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
