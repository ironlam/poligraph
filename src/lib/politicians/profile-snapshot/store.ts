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
 * Upserts the document unless the stored one was built later, in a single statement.
 *
 * `builtAt` is when the build started, so a slow build that read older data cannot overwrite a
 * faster one that started after it. `written` says whether a row was inserted or updated;
 * `changed` whether its content hash differs from the previous row (or there was none). The
 * previous hash comes from the statement's snapshot, taken before the upsert.
 */
export async function writeProfileSnapshot(input: {
  politicianId: string;
  document: PoliticianProfileDocument;
  startedAt: Date;
}): Promise<{ written: boolean; changed: boolean }> {
  const data = serializeProfileDocument(input.document);
  const contentHash = hashSerializedDocument(data);

  const rows = await db.$queryRaw<Array<{ prev_hash: string | null; written: number }>>(Prisma.sql`
    WITH prev AS (
      SELECT "contentHash" FROM "PoliticianProfileSnapshot"
      WHERE "politicianId" = ${input.politicianId}
    ),
    up AS (
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
      RETURNING "contentHash"
    )
    SELECT (SELECT "contentHash" FROM prev) AS prev_hash, (SELECT count(*) FROM up)::int AS written
  `);

  const row = rows[0];
  const written = (row?.written ?? 0) > 0;
  const changed = written && (row?.prev_hash == null || row.prev_hash !== contentHash);
  return { written, changed };
}
