/**
 * Links the presidential presentations in base to the `Politician` who made them: a dated
 * mandate of the published type, in the published territory, covering the publication date,
 * under the same name, confirmed by the identity resolver.
 *
 * Usage :
 *   npm run sync:parrainages-elus -- --election=presidentielle-2022          aperçu, aucune écriture
 *   npm run sync:parrainages-elus -- --election=presidentielle-2022 --write  écriture des liens
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { linkParrainagesElus } from "@/services/sync/parrainages-elus-link";

async function main() {
  const write = process.argv.includes("--write");
  const election = process.argv.find((a) => a.startsWith("--election="))?.slice(11);
  if (!election) throw new Error("--election attendu, par exemple presidentielle-2022");
  console.log(
    `Rapprochement des élus, ${election}${write ? " [ÉCRITURE]" : " [APERÇU, aucune écriture]"}`
  );

  const r = await linkParrainagesElus(election, { write });
  console.log(
    `  présentations sans lien examinées : ${r.examined}, déjà reliées : ${r.alreadyLinked}`
  );
  console.table(r.byMandat);
  const links = Object.values(r.byMandat).reduce((sum, line) => sum + line.LINK, 0);
  console.log(`  liens établis : ${links}, vers ${r.politicians} fiches`);
  console.log(`  écrit : ${r.written}`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
