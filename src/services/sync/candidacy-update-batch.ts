import { Prisma } from "@/generated/prisma";

/**
 * One candidacy row to update during a candidatures sync.
 *
 * Mirrors the columns the sequential `db.candidacy.update()` loop wrote, and nothing more:
 * widening it would silently start overwriting columns the sync never owned.
 */
export type CandidacyUpdateRow = {
  id: string;
  politicianId: string | null;
  partyId: string | null;
  partyLabel: string | null;
  listName: string | null;
  listPosition: number | null;
  constituencyName: string | null;
  candidateId: string | null;
  communeId: string | null;
};

/**
 * Keep one row per id, the last one, and preserve first-appearance order.
 *
 * The sequential loop this replaces applied each update in turn, so a CSV holding two rows for the
 * same candidacy ended on the later one. `UPDATE ... FROM (VALUES ...)` has no such rule: with
 * several source rows matching one target, PostgreSQL does not define which is used. Collapsing
 * duplicates first is what keeps the behaviour identical.
 */
export function dedupeCandidacyUpdates(rows: CandidacyUpdateRow[]): CandidacyUpdateRow[] {
  const byId = new Map<string, CandidacyUpdateRow>();
  for (const row of rows) {
    byId.set(row.id, row);
  }
  return [...byId.values()];
}

/**
 * Build the single statement that applies the batch, with the number of rows it targets.
 * Returns null when there is nothing to write.
 *
 * Casts sit in the SET clause, not inside VALUES: the pg adapter rejects some casts written in a
 * VALUES list, and a column whose every value is null would otherwise be inferred as text and fail
 * on assignment to the integer column.
 *
 * `updatedAt` is passed explicitly. The column is declared `@updatedAt`, which Prisma fills client
 * side; raw SQL bypasses that entirely and would leave the timestamp untouched.
 *
 * This module deliberately does not import `@/lib/db`: that module builds the client at import time
 * and throws without DATABASE_URL, which the unit-test CI job does not provide.
 */
export function buildCandidacyUpdateBatch(
  rows: CandidacyUpdateRow[],
  updatedAt: Date
): { sql: Prisma.Sql; targets: number } | null {
  const deduped = dedupeCandidacyUpdates(rows);
  if (deduped.length === 0) return null;

  const values = Prisma.join(
    deduped.map(
      (r) =>
        Prisma.sql`(${r.id}, ${r.politicianId}, ${r.partyId}, ${r.partyLabel}, ${r.listName}, ${r.listPosition}, ${r.constituencyName}, ${r.candidateId}, ${r.communeId})`
    )
  );

  const sql = Prisma.sql`
    UPDATE "Candidacy" AS c
    SET "politicianId"     = v."politicianId"::text,
        "partyId"          = v."partyId"::text,
        "partyLabel"       = v."partyLabel"::text,
        "listName"         = v."listName"::text,
        "listPosition"     = v."listPosition"::int,
        "constituencyName" = v."constituencyName"::text,
        "candidateId"      = v."candidateId"::text,
        "communeId"        = v."communeId"::text,
        "updatedAt"        = ${updatedAt}
    FROM (VALUES ${values}) AS v(
      "id", "politicianId", "partyId", "partyLabel", "listName",
      "listPosition", "constituencyName", "candidateId", "communeId"
    )
    WHERE c."id" = v."id"::text
  `;

  // `targets` travels with the SQL so a caller cannot compare the affected-row count to the number
  // of entries it passed in: duplicates make those two numbers differ legitimately.
  return { sql, targets: deduped.length };
}
