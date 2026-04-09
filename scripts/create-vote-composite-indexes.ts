/**
 * Phase 5b: create the two composite indexes on Vote needed by the perf
 * improvements (slow queries #2 and #3 in the Supabase report):
 *
 *   - Vote_politicianId_votingDate_idx          (covers #2)
 *   - Vote_politicianId_chamber_votingDate_idx  (covers #3)
 *
 * Both indexes are created with CONCURRENTLY to avoid blocking writes.
 * Each one takes ~60-90s on production (1.5M rows). Total runtime: ~3 minutes.
 *
 * Idempotent: any index that already exists is skipped.
 *
 * Why pg.Pool instead of Prisma:
 *   Prisma wraps every raw query in an implicit transaction, but CREATE INDEX
 *   CONCURRENTLY must run outside any transaction. We use the raw pg client
 *   directly so Postgres sees an autocommit session.
 *
 * Run:
 *   npx dotenv -e .env -- npx tsx scripts/create-vote-composite-indexes.ts
 */
import { Pool } from "pg";

interface IndexSpec {
  name: string;
  columns: string;
}

const INDEXES: IndexSpec[] = [
  {
    name: "Vote_politicianId_votingDate_idx",
    columns: '"politicianId", "votingDate" DESC',
  },
  {
    name: "Vote_politicianId_chamber_votingDate_idx",
    columns: '"politicianId", "chamber", "votingDate" DESC',
  },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: connectionString.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
  });

  try {
    for (const idx of INDEXES) {
      console.log(`[create-vote-composite-indexes] checking ${idx.name}...`);

      const exists = await pool.query(
        `SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
        [idx.name]
      );

      if (exists.rowCount && exists.rowCount > 0) {
        console.log(`[create-vote-composite-indexes] ${idx.name} already exists, skipping`);
        continue;
      }

      console.log(`[create-vote-composite-indexes] creating ${idx.name} CONCURRENTLY (60-90s)...`);
      const t0 = Date.now();

      // pg.Pool does NOT wrap statements in implicit transactions, so CONCURRENTLY works.
      // The index name + column list are interpolated from a static const, no user input.
      await pool.query(`CREATE INDEX CONCURRENTLY "${idx.name}" ON "Vote" (${idx.columns})`);

      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`[create-vote-composite-indexes] ${idx.name} DONE in ${elapsed}s`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[create-vote-composite-indexes] FAILED:", err);
  process.exit(1);
});
