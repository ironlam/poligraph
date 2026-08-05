#!/usr/bin/env tsx
/**
 * npm run measures:migrate-promises -- --election <id> [--apply]
 *
 * Migrates the legacy `Promise` rows to the versioned measure model. **Dry-run by default**: writing
 * demands `--apply`, because this creates public editorial content.
 *
 * `Promise` rows are read, never modified. Retiring the model is a separate `db:push`, after the code
 * that stops using it has been deployed.
 */
import { db } from "@/lib/db";
import { migratePromisesToMeasures } from "@/lib/measures/promise-migration";

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const electionId = argValue("election");
  if (electionId === undefined) {
    console.error("Usage : --election <id> [--apply]");
    process.exitCode = 1;
    return;
  }
  const dryRun = !process.argv.includes("--apply");

  const report = await migratePromisesToMeasures({ electionId, dryRun });

  console.log(`[migrate-promises] élection ${report.electionId}`);
  console.log(`  mode              ${dryRun ? "essai à blanc (aucune écriture)" : "APPLIQUÉ"}`);
  console.log(`  lignes lues       ${report.scanned}`);
  console.log(`  migrées           ${report.migrated}`);
  console.log(`  déjà migrées      ${report.alreadyMigrated}`);
  console.log(`  rejetées          ${report.rejects.length}`);

  for (const reject of report.rejects) {
    console.log(`    ${reject.promiseId} : ${reject.reason}`);
  }

  // Le compte doit se refermer : sans cette vérification, une ligne perdue en silence passerait pour
  // un succès.
  const accounted = report.migrated + report.alreadyMigrated + report.rejects.length;
  if (accounted !== report.scanned) {
    console.error(`\n[migrate-promises] ${report.scanned} lues mais ${accounted} comptabilisées`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
