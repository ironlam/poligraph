/**
 * Assign publication status to all politicians based on prominence rules.
 *
 * Rules (in priority order):
 *   1. statusOverride = true → skip (manual override)
 *   2. Deceased before 1958 → EXCLUDED
 *   3. Born before 1920 AND no current mandate AND low score → EXCLUDED
 *   4. Published profile with a sourced published presidential candidacy → keep PUBLISHED
 *   5. Published direct affair → PUBLISHED
 *   6. Has current mandate → PUBLISHED
 *   7. prominenceScore >= 150 AND has photo or biography → PUBLISHED
 *   8. Deceased > 10 years → ARCHIVED
 *   9. prominenceScore < 50 AND no current mandate → ARCHIVED
 *   10. Otherwise → DRAFT
 *
 * Usage:
 *   npx tsx scripts/assign-publication-status.ts              # Apply changes
 *   npx tsx scripts/assign-publication-status.ts --dry-run    # Preview only
 */
import "dotenv/config";
import { assignPublicationStatus } from "../src/services/sync/publication-status";
import { db } from "../src/lib/db";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  console.log("=".repeat(60));
  console.log("Assign Publication Status");
  console.log("=".repeat(60));
  if (dryRun) {
    console.log("[DRY-RUN] No changes will be written to the database.\n");
  }

  const stats = await assignPublicationStatus({ dryRun });

  console.log(`\nTotal politicians: ${stats.totalPoliticians}`);
  console.log(`Skipped (statusOverride): ${stats.skippedOverride}`);
  console.log(`Unchanged: ${stats.unchanged}`);

  let totalChanges = 0;
  for (const [status, count] of Object.entries(stats.changes)) {
    console.log(`  → ${status}: ${count}`);
    totalChanges += count;
  }
  console.log(`Total changes: ${totalChanges}`);

  if (dryRun) {
    console.log("\n[DRY-RUN] No changes applied.");
  } else if (totalChanges > 0) {
    console.log("\nDone!");
  } else {
    console.log("\nNo changes needed.");
  }
}

main()
  .catch(console.error)
  .finally(() => {
    db.$disconnect();
  });
