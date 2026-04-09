/**
 * Phase 5b: apply the Vote denormalization sync trigger.
 *
 * Idempotent (CREATE OR REPLACE + DROP IF EXISTS).
 *
 * Why pg.Pool instead of Prisma:
 *   The plpgsql function body uses dollar-quoted strings ($$ ... $$) and
 *   contains multiple statements. Prisma 7's @prisma/adapter-pg parameterizes
 *   queries before sending them to Postgres, which can interfere with
 *   dollar-quoting. Using pg.Pool directly sends the SQL verbatim through
 *   the simple query protocol — same dollar-quoting semantics as `psql`,
 *   no surprises.
 *
 * Run:
 *   npx dotenv -e .env -- npx tsx scripts/apply-vote-denorm-trigger.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const sqlPath = path.join(
    process.cwd(),
    "prisma/migrations/manual/2026-04-08-vote-denorm-trigger.sql"
  );
  const sql = readFileSync(sqlPath, "utf-8");

  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: connectionString.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
  });

  try {
    console.log(`[apply-vote-denorm-trigger] applying ${sqlPath}`);
    // pg supports multi-statement SQL via the simple query protocol.
    // The SQL file is a static asset committed in the repo, no user input.
    await pool.query(sql);
    console.log("[apply-vote-denorm-trigger] DONE");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[apply-vote-denorm-trigger] FAILED:", err);
  process.exit(1);
});
