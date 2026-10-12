/**
 * Commune surface (hectares) from geo.api.gouv.fr into Commune.surfaceHa (#1052).
 *
 * Usage :
 *   npx tsx --env-file=.env scripts/sync-surfaces.ts --dry-run
 *   npx tsx --env-file=.env scripts/sync-surfaces.ts
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { syncCommuneSurfaces } from "@/services/sync/commune-surfaces";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`Superficie des communes${dryRun ? " [DRY-RUN, aucune écriture]" : ""}`);
  const r = await syncCommuneSurfaces({ dryRun });
  console.log(`  colonne présente : ${r.columnReady ? "oui" : "non (SQL manuel à appliquer)"}`);
  console.log(`  lignes de la source : ${r.sourceRows}, communes en base : ${r.communesInBase}`);
  console.log(`  à écrire : ${r.plan.toWrite}, inchangées : ${r.plan.unchanged}`);
  console.log(`  sans surface exploitable : ${r.plan.rejected}`);
  console.log(`  absentes de la source : ${r.plan.missingFromSource}`);
  console.log(
    `  codes inconnus de la base : ${r.plan.unknownCodes.length}${
      r.plan.unknownCodes.length ? ` (${r.plan.unknownCodes.slice(0, 10).join(" ")})` : ""
    }`
  );
  console.log(`  écrites : ${r.written}`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
