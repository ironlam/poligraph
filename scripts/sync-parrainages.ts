/**
 * Presidential presentations ("parrainages") published by the Conseil constitutionnel.
 *
 * Usage :
 *   npm run sync:parrainages -- --election=presidentielle-2022          aperçu, aucune écriture
 *   npm run sync:parrainages -- --election=presidentielle-2022 --write  écriture
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { PARRAINAGES_SOURCES, syncParrainages } from "@/services/sync/parrainages";

async function main() {
  const write = process.argv.includes("--write");
  const election = process.argv.find((a) => a.startsWith("--election="))?.slice(11);
  if (!election) {
    throw new Error(`--election attendu : ${Object.keys(PARRAINAGES_SOURCES).join(", ")}`);
  }
  console.log(`Parrainages ${election}${write ? " [ÉCRITURE]" : " [APERÇU, aucune écriture]"}`);

  const r = await syncParrainages(election, { write });
  const { plan } = r;
  const t = plan.territories;
  console.log(`  source : ${r.sourceUrl}`);
  console.log(`  lignes lues : ${r.linesRead}, candidats : ${plan.fileTotals.length}`);
  console.log(`  en base : ${r.tableReady ? r.stored : "table absente (SQL manuel à appliquer)"}`);
  console.log(`  déjà en base : ${plan.alreadyStored}, à créer : ${plan.creates.length}`);
  console.log(
    `  départements : ${t.department.RESOLVED} résolus, ${t.department.AMBIGUOUS} ambigus, ${t.department.NOT_FOUND} introuvables, ${t.department.NOT_APPLICABLE} sans objet`
  );
  console.log(
    `  communes : ${t.commune.RESOLVED} résolues, ${t.commune.AMBIGUOUS} ambiguës, ${t.commune.NOT_FOUND} introuvables, ${t.commune.NOT_APPLICABLE} sans objet`
  );
  console.log(
    `  communes retrouvées par fusion ou changement de nom : ${t.viaSuccessor}, codes à compléter en base : ${plan.communeBackfills.length}`
  );
  console.log(`  publications : ${plan.publications.map(([d, n]) => `${d}=${n}`).join(" ")}`);
  console.log("\n  Présentations par candidat (fichier), candidature en base :");
  const links = new Map(plan.candidacyLinks.map((l) => [l.candidateName, l.candidacyName]));
  for (const [name, count] of plan.fileTotals) {
    console.log(`  ${String(count).padStart(6)}  ${name}  ->  ${links.get(name) ?? "aucune"}`);
  }
  if (plan.blockers.length) {
    console.log(`\n  BLOCAGES :\n  - ${plan.blockers.join("\n  - ")}`);
  }
  console.log(`\n  écrit : ${r.written}, codes de commune complétés : ${r.backfilled}`);
  await db.$disconnect();
  if (plan.blockers.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
