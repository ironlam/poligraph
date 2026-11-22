/**
 * Rapports des chambres régionales et territoriales des comptes (Territoires v2, lot C).
 *
 * Aperçu par défaut : lit les flux des chambres et la page de chaque nouveau rapport, affiche les
 * notices prévues et leur territoire proposé, sans rien écrire. Avec --write, écrit les notices en
 * BROUILLON (DRAFT), à confirmer, corriger ou rejeter dans /admin/territoires/rapports-crc.
 * Relancer ne réécrit rien : un rapport déjà en base n'est ni relu ni réécrit.
 * Seuls les rapports des 30 derniers jours sont retenus ; --depuis=AAAA-MM-JJ remonte plus loin,
 * dans la limite de ce que les flux listent encore (reprise d'historique, à décider à part).
 *
 * Usage :
 *   npx tsx --env-file=.env scripts/sync-rapports-crc.ts
 *   npx tsx --env-file=.env scripts/sync-rapports-crc.ts --write
 *   npx tsx --env-file=.env scripts/sync-rapports-crc.ts --depuis=2026-06-01
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { syncRapportsCrc } from "@/services/sync/rapports-crc";

async function main() {
  const write = process.argv.includes("--write");
  console.log(`Rapports CRC${write ? "" : " [APERÇU, aucune écriture]"}`);

  const depuisArg = process.argv.find((a) => a.startsWith("--depuis="))?.split("=")[1];
  const depuis = depuisArg ? new Date(`${depuisArg}T00:00:00Z`) : undefined;
  if (depuis && Number.isNaN(depuis.getTime())) throw new Error("--depuis=AAAA-MM-JJ attendu");

  const r = await syncRapportsCrc({ dryRun: !write, depuis });
  console.log(`Chambres lues : ${r.chambresLues}, en erreur : ${r.chambresEnErreur.length}`);
  for (const e of r.chambresEnErreur) console.log(`  ${e}`);
  const ecartes = Object.entries(r.ecartes)
    .map(([motif, n]) => `${motif} ${n}`)
    .join(", ");
  console.log(`Publications lues : ${r.publications}, écartées [${ecartes || "aucune"}]`);
  console.log(`Notices prévues : ${r.notices.length}`);
  for (const n of r.notices) {
    const day = n.occurredOn.toISOString().slice(0, 10);
    console.log(
      `  ${day} ${n.territoryType} ${n.territoryCode ?? "?"} (${n.rattachement}) ${n.titre}`
    );
  }
  if (write) console.log(`Brouillons écrits : ${r.written}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
