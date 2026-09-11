/**
 * CLI runner for the presidential snapshot pre-computation.
 *
 * Usage:
 *   npm run sync:presidential-snapshots
 *   npm run sync:presidential-snapshots -- --dry-run
 */

import "dotenv/config";
import { db } from "@/lib/db";
import { computePresidentialSnapshots } from "@/services/sync/compute-presidential-snapshots";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log(`Computing presidential snapshots${DRY_RUN ? " (DRY RUN)" : ""}...`);
  const t0 = Date.now();
  try {
    const result = await computePresidentialSnapshots(undefined, { dryRun: DRY_RUN });
    console.log(`\nDone in ${result.totalDurationMs}ms`);
    console.log(`Computed ${result.computed.length} snapshot(s):`);
    for (const s of result.computed) {
      console.log(`  - ${s}`);
    }
  } catch (err) {
    console.error("FAILED:", err);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
  console.log(`\nTotal wall-clock: ${Date.now() - t0}ms`);
}

main();
