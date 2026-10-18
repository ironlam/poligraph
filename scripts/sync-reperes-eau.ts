/**
 * Nitrates de l'eau du robinet, lot R4 de « Le territoire en chiffres » (#1052).
 *
 * Lit en flux les fichiers du contrôle sanitaire (environ 300 Mo compressés par an, 1,3 Go
 * décompressés), compte les analyses sur douze mois par unité de distribution et écrit un lot en
 * BROUILLON, relu puis publié depuis /admin/territoires/reperes. Les zips sont mis en cache dans
 * scripts/.local/eau-cache (gitignoré).
 *
 * Usage :
 *   npx tsx --env-file=.env scripts/sync-reperes-eau.ts           (aperçu, aucune écriture)
 *   npx tsx --env-file=.env scripts/sync-reperes-eau.ts --write   (écrit le brouillon)
 *   Option : --prelevements=TOUS (défaut) | SUR_UNITE
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { syncReperesEau } from "@/services/sync/reperes-eau";

async function main() {
  const write = process.argv.includes("--write");
  console.log(`Nitrates de l'eau${write ? "" : " [APERÇU, aucune écriture]"}`);
  const arg = process.argv.find((a) => a.startsWith("--prelevements="))?.split("=")[1];
  if (arg && !["TOUS", "SUR_UNITE"].includes(arg)) {
    throw new Error("--prelevements attend TOUS ou SUR_UNITE");
  }
  const r = await syncReperesEau({
    dryRun: !write,
    policy: arg as "TOUS" | "SUR_UNITE" | undefined,
    cacheDir: "scripts/.local/eau-cache",
    onProgress: (m) => console.log(`  ${m}`),
  });
  const { report } = r;
  console.log(`Prélèvements retenus : ${report.policy} (lignes écartées : ${report.droppedLines})`);
  console.log(`Fenêtre : du ${report.window.start} au ${report.window.end}`);
  console.log(`Unités avec au moins une analyse : ${report.unitsWithAnalyses}`);
  console.log(`Lignes (commune x unité) : ${report.rows.length} dans ${report.communes} communes`);
  console.log(`  établies : ${report.established}`);
  console.log(`  sous le seuil d'analyses : ${report.belowThreshold}`);
  console.log(`Résultats non placés face à la limite (non comptés) : ${report.indeterminate}`);
  console.log(`Résultats hors limite de 50 mg/L (écartés) : ${report.otherLimit}`);
  if (r.importId) console.log(`Lot BROUILLON ${r.importId} : ${r.rowsWritten} lignes écrites`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
