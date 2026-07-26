/**
 * Judilibre diagnostics — read-only (#337).
 *
 * Usage:
 *   npm run judilibre:diagnostics
 *
 * Replaces `sync-judilibre.ts`, which drove the name-based discovery pipeline:
 * it searched the Cour de cassation corpus for a politician's name and created
 * affairs from the hits. Over 156 decisions it produced 0 affairs, because the
 * corpus is pseudonymised, and it was removed in #337.
 *
 * This script only reads and prints. To fill in a decision's official fields, use
 * the targeted enrichment: it starts from a judicial reference and writes onto a
 * `CourtDecision`, never onto an `Affair`.
 */

import "dotenv/config";
import { db } from "../src/lib/db";
import { getJudilibreStats } from "../src/services/sync/judilibre-diagnostics";

async function main() {
  await getJudilibreStats();
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    await db.$disconnect();
    process.exit(1);
  });
