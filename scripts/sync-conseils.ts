/**
 * Members of the departmental and regional councils, from the RNE (#1052).
 *
 * Usage :
 *   npx tsx --env-file=.env scripts/sync-conseils.ts --dry-run
 *   npx tsx --env-file=.env scripts/sync-conseils.ts
 *   Option : --niveau=DEPARTEMENTAL | REGIONAL | MUNICIPAL (departmental and regional by
 *   default: the municipal file is 65 MB and is asked for explicitly)
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { syncConseils, type ImportedNiveau } from "@/services/sync/conseils";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const arg = process.argv.find((a) => a.startsWith("--niveau="))?.slice("--niveau=".length);
  if (arg && arg !== "DEPARTEMENTAL" && arg !== "REGIONAL" && arg !== "MUNICIPAL") {
    throw new Error("--niveau attend DEPARTEMENTAL, REGIONAL ou MUNICIPAL");
  }
  const niveaux: ImportedNiveau[] = arg ? [arg as ImportedNiveau] : ["DEPARTEMENTAL", "REGIONAL"];
  console.log(`Conseils RNE${dryRun ? " [DRY-RUN, aucune écriture]" : ""}`);

  for (const niveau of niveaux) {
    const r = await syncConseils(niveau, { dryRun });
    console.log(`\n=== ${niveau} ===`);
    console.log(`  source : ${r.sourceUrl}`);
    console.log(`  registre publié le : ${r.registerDate ?? "date illisible"}`);
    console.log(`  lignes lues : ${r.linesRead}, retenues : ${r.rows}`);
    console.log(`  écartées (sans nom ou territoire) : ${r.skipped}, doublons : ${r.duplicates}`);
    console.log(`  avec une fonction : ${r.withFunction}`);
    console.log(`  territoires couverts : ${r.territories}`);
    console.log(
      `  en base : ${r.tableReady ? r.stored : "table absente (SQL manuel à appliquer)"}`
    );
    console.log(`  fonctions : ${r.topFunctions.map(([f, n]) => `${f}=${n}`).join(" | ")}`);
    const sizes = Object.entries(r.perTerritory).sort((a, b) => a[1] - b[1]);
    console.log(
      `  plus petits : ${sizes
        .slice(0, 5)
        .map(([c, n]) => `${c}=${n}`)
        .join(" ")}`
    );
    console.log(
      `  plus grands : ${sizes
        .slice(-5)
        .map(([c, n]) => `${c}=${n}`)
        .join(" ")}`
    );
    console.log(`  écrit : ${r.written ? "oui" : "non"}`);
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
