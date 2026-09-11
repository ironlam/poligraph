/**
 * CLI runner for the presidential snapshot pre-computation.
 *
 * Usage:
 *   npm run sync:presidential-snapshots
 */

import "dotenv/config";
import { db } from "@/lib/db";
import { computePresidentialSnapshots } from "@/services/sync/compute-presidential-snapshots";

async function main() {
  console.log("Computing presidential snapshots...");
  const t0 = Date.now();
  try {
    const result = await computePresidentialSnapshots();
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
