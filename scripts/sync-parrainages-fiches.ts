/**
 * Asks for the recompute of the politician profiles that show the presidential presentations of
 * one election: the elected officials linked to a presentation, and the candidates who received
 * some. To run after a deploy that changes what the profile shows, or after new links.
 *
 * Usage :
 *   npm run sync:parrainages-fiches -- --election=presidentielle-2022          aperçu
 *   npm run sync:parrainages-fiches -- --election=presidentielle-2022 --write  demande le recalcul
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { refreshParrainagesFiches } from "@/services/sync/parrainages-fiches";

async function main() {
  const write = process.argv.includes("--write");
  const election = process.argv.find((a) => a.startsWith("--election="))?.slice(11);
  if (!election) throw new Error("--election attendu, par exemple presidentielle-2022");
  console.log(
    `Recalcul des fiches, ${election}${write ? " [DEMANDE ENVOYÉE]" : " [APERÇU, rien n'est envoyé]"}`
  );

  const r = await refreshParrainagesFiches(election, { write });
  console.log(`  élus publiés reliés à une présentation : ${r.presenters}`);
  console.log(`  candidats publiés ayant reçu des présentations : ${r.recipients}`);
  console.log(`  fiches distinctes : ${r.total}`);
  console.log(`  mode : ${r.mode ?? "aucun (aperçu)"}`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
