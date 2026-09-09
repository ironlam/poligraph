/**
 * Maires d'arrondissement et de secteur (loi PLM), issue #587.
 *
 * Usage :
 *   npx tsx --env-file=.env scripts/sync-rne-arrondissements.ts --dry-run
 *   npx tsx --env-file=.env scripts/sync-rne-arrondissements.ts
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { syncArrondissementMayors } from "@/services/sync/rne-arrondissements";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`Maires d'arrondissement${dryRun ? " [DRY-RUN, aucune écriture]" : ""}`);

  const stats = await syncArrondissementMayors({ dryRun });

  console.log("");
  console.log(`  maires trouvés dans le RNE : ${stats.mayorsFound}`);
  console.log(`  déjà en base, à jour       : ${stats.alreadyCurrent}`);
  console.log(`  reliés à une fiche existante: ${stats.linkedToExisting}`);
  console.log(`  créés en brouillon         : ${stats.createdAsDraft}`);

  if (stats.errors.length > 0) {
    console.log("");
    console.log(`=== ${stats.errors.length} erreur(s) ===`);
    for (const e of stats.errors.slice(0, 10)) console.log(`  ${e}`);
  }
}

main()
  .catch((e) => {
    console.error("ERREUR", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
