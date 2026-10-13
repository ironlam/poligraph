/**
 * Structure par âge des communes, lot R2 de « Le territoire en chiffres » (#1052).
 *
 * Écrit un lot en BROUILLON (DRAFT), jamais publié : une personne relit un échantillon et les
 * comptes, puis publie le lot entier. Les tables n'existent qu'une fois appliqué
 * prisma/migrations/manual/2026-10-13-territoire-reperes.sql (base de production unique).
 *
 * Usage :
 *   npx tsx --env-file=.env scripts/sync-reperes-age.ts           (aperçu, aucune écriture)
 *   npx tsx --env-file=.env scripts/sync-reperes-age.ts --write   (écrit le brouillon)
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { syncReperesAge } from "@/services/sync/reperes-age";

async function main() {
  const write = process.argv.includes("--write");
  console.log(`Structure par âge${write ? "" : " [APERÇU, aucune écriture]"}`);
  const r = await syncReperesAge({ dryRun: !write });
  const { report } = r;
  console.log(`Communes rapprochées : ${report.communes}`);
  console.log(`Communes du fichier inconnues de Poligraph : ${report.unknownCommunes}`);
  console.log(`Lignes à écrire : ${report.rows.length}`);
  console.log(`Effectifs absents de la source : ${report.nonEtabli.effectifAbsent.length}`);
  console.log(`Population nulle : ${report.nonEtabli.populationNulle.length}`);
  console.log(`Sommes hors tolérance (non écrites) : ${report.sumErrors.length}`);
  if (r.importId) console.log(`Lot BROUILLON ${r.importId} : ${r.rowsWritten} lignes écrites`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
