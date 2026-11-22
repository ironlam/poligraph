/**
 * Comptes de la collectivité (Territoires v2, lot C), source OFGL.
 *
 * Aperçu par défaut : lit l'OFGL, applique le plan et affiche les comptes, sans rien écrire.
 * Avec --write, écrit un lot en BROUILLON (DRAFT) par échelle, à relire puis publier dans
 * /admin/territoires/reperes. Un plan qui porte une anomalie n'est pas écrit.
 *
 * Usage :
 *   npx tsx --env-file=.env scripts/sync-reperes-comptes.ts --echelle=REG
 *   npx tsx --env-file=.env scripts/sync-reperes-comptes.ts --echelle=COM --exercices=2024
 *   npx tsx --env-file=.env scripts/sync-reperes-comptes.ts --echelle=DEP --write
 *   --toutes-communes : toutes les communes, et non celles de 1 000 habitants et plus.
 */
import "dotenv/config";
import { db } from "@/lib/db";
import type { RepereTerritoryKind } from "@/config/territoire-reperes";
import { exercicesOfSeries, syncReperesComptes } from "@/services/sync/reperes-comptes";

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}

async function main() {
  const echelle = arg("echelle");
  if (echelle !== "COM" && echelle !== "DEP" && echelle !== "REG") {
    throw new Error("--echelle=COM, DEP ou REG est obligatoire");
  }
  const exercices = arg("exercices")?.split(",").map(Number) ?? exercicesOfSeries();
  const write = process.argv.includes("--write");
  console.log(
    `Comptes ${echelle}, exercices ${exercices.join(", ")}${write ? "" : " [APERÇU, aucune écriture]"}`
  );

  const r = await syncReperesComptes({
    scale: echelle as RepereTerritoryKind,
    dryRun: !write,
    exercices,
    perimetre: process.argv.includes("--toutes-communes") ? "TOUTES" : "COMMUNES_INDEXABLES",
  });
  console.log(`Territoires Poligraph couverts par l'import : ${r.territories}`);
  for (const { exercice, plan } of r.plans) {
    const absent = Object.entries(plan.absent)
      .map(([reason, codes]) => `${reason} ${codes?.length ?? 0}`)
      .join(", ");
    console.log(
      `${exercice} : ${plan.covered} avec comptes, ${plan.rows.length} lignes, absents [${absent || "aucun"}], ` +
        `hors territoire Poligraph ${plan.horsTerritoire.length}, anomalies ${plan.anomalies.length}`
    );
    for (const a of plan.anomalies.slice(0, 10))
      console.log(`  ${a.code} ${a.agregat} : ${a.detail}`);
  }
  console.log(`Lignes prévues : ${r.rowsPlanned}`);
  if (r.importId) console.log(`Lot BROUILLON ${r.importId} : ${r.rowsWritten} lignes écrites`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
