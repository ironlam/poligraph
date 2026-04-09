/**
 * One-shot backfill for Phase 5a Vote denormalization.
 *
 * Populates Vote.votingDate AND Vote.chamber from the parent Scrutin row for
 * any Vote where either denorm field is NULL.
 *
 * Strategy: iterate scrutins (~10K of them) and issue one indexed UPDATE per
 * scrutin. This avoids the seq-scan-on-NULL trap that a naive
 * "WHERE votingDate IS NULL LIMIT N" approach would trigger on a 1.5M-row table.
 *
 * Idempotent: re-running this is safe (the UPDATE filters on
 * "votingDate IS NULL OR chamber IS NULL" so already-backfilled rows are
 * skipped).
 * Resumable: progress is logged after each scrutin, and interrupting + re-running
 * picks up where it left off (the WHERE filters on NULL).
 *
 * Production scale: ~10K scrutins × avg 150 votes = ~1.5M rows.
 * Expect ~3-5 minutes total wall clock.
 *
 * Run:
 *   npx dotenv -e .env -- npx tsx scripts/backfill-vote-denorm.ts
 *
 * Dry-run (count only, no writes):
 *   npx dotenv -e .env -- npx tsx scripts/backfill-vote-denorm.ts --dry-run
 */
import { db } from "@/lib/db";

const PROGRESS_EVERY = 100; // log every N scrutins

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const t0 = Date.now();

  console.log(`[backfill-vote-denorm] starting (dry-run: ${dryRun})`);

  // Count rows that need a backfill (one scan, fast enough at 1.5M)
  const [{ count: nullCount }] = await db.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*)::bigint as count
    FROM "Vote"
    WHERE "votingDate" IS NULL OR "chamber" IS NULL
  `;
  console.log(`[backfill-vote-denorm] ${nullCount} Vote rows need backfill`);

  if (dryRun) {
    console.log("[backfill-vote-denorm] dry-run, exiting");
    return;
  }
  if (nullCount === BigInt(0)) {
    console.log("[backfill-vote-denorm] nothing to do, exiting");
    return;
  }

  // Find scrutins that have at least one Vote needing backfill.
  // We use a DISTINCT subquery to avoid scanning Vote multiple times.
  const scrutinIds = await db.$queryRaw<Array<{ id: string }>>`
    SELECT DISTINCT v."scrutinId" as id
    FROM "Vote" v
    WHERE v."votingDate" IS NULL OR v."chamber" IS NULL
    ORDER BY v."scrutinId"
  `;
  console.log(`[backfill-vote-denorm] ${scrutinIds.length} scrutins to process`);

  let totalUpdated = BigInt(0);
  let processed = 0;

  for (const { id: scrutinId } of scrutinIds) {
    // Single-statement UPDATE: indexed lookup by scrutinId, no seq scan.
    const result = await db.$queryRaw<[{ updated: bigint }]>`
      WITH src AS (
        SELECT "votingDate", "chamber" FROM "Scrutin" WHERE id = ${scrutinId}
      ),
      upd AS (
        UPDATE "Vote" v
        SET "votingDate" = src."votingDate", "chamber" = src."chamber"
        FROM src
        WHERE v."scrutinId" = ${scrutinId}
          AND (v."votingDate" IS NULL OR v."chamber" IS NULL)
        RETURNING v.id
      )
      SELECT COUNT(*)::bigint as updated FROM upd
    `;

    const updated = result[0]?.updated ?? BigInt(0);
    totalUpdated += updated;
    processed += 1;

    if (processed % PROGRESS_EVERY === 0) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(
        `[backfill-vote-denorm] processed ${processed}/${scrutinIds.length} scrutins, ${totalUpdated} rows updated (${elapsed}s elapsed)`
      );
    }
  }

  const totalElapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `[backfill-vote-denorm] DONE: ${totalUpdated} rows across ${processed} scrutins in ${totalElapsed}s`
  );

  // Verify zero NULLs remain
  const [{ count: remaining }] = await db.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*)::bigint as count
    FROM "Vote"
    WHERE "votingDate" IS NULL OR "chamber" IS NULL
  `;
  if (remaining > BigInt(0)) {
    console.warn(
      `[backfill-vote-denorm] WARN: ${remaining} rows still NULL — did syncs run during backfill? Re-run the script.`
    );
    process.exitCode = 1;
  } else {
    console.log("[backfill-vote-denorm] verified: 0 NULL rows");
  }
}

main()
  .catch((err) => {
    console.error("[backfill-vote-denorm] FAILED:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
