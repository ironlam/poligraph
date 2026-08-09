/**
 * Read-only audit of senatorial mandates: renewal series and start-date plausibility.
 *
 * Why. `SenateurAPI.serie` was typed `number` while the Senate API returns a
 * string, so the sync's `serie === 1` was never true. The series was not
 * persisted, and the date fallback gave everyone the series-2 term start
 * (1 October 2020), including series-1 senators elected in September 2023. The
 * sync also preserves an existing date when NosSénateurs supplies none, so
 * replaying sync:senat does not erase the dates already written.
 *
 * This script fixes nothing. It measures the gap between the API and the database
 * so we can decide what to correct, and from which source.
 *
 * Usage:
 *   npm run audit:senateurs-series
 *   npm run audit:senateurs-series -- --verbose   (list every suspect mandate)
 */

import "dotenv/config";
import { db } from "../src/lib/db";
import { SENAT_API_URL } from "../src/services/sync/senateurs";
import {
  parseSenateSeries,
  getSeriesTermStart,
  type SenateSeries,
} from "../src/config/senatoriales";
import type { SenateurAPI } from "../src/services/sync/types";

interface AuditRow {
  fullName: string;
  constituency: string | null;
  series: SenateSeries;
  startDate: Date;
  termStart: Date;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function main() {
  const verbose = process.argv.includes("--verbose");

  console.log("=== Audit séries et dates de début des sénateurs ===\n");

  const response = await fetch(SENAT_API_URL);
  if (!response.ok) {
    throw new Error(`API Sénat indisponible : ${response.status} ${response.statusText}`);
  }
  const senators: SenateurAPI[] = await response.json();

  const apiSeries = new Map<string, SenateSeries>();
  let unparsableSeries = 0;
  for (const sen of senators) {
    const series = parseSenateSeries(sen.serie);
    if (series === null) {
      unparsableSeries++;
      continue;
    }
    apiSeries.set(`senat-${sen.matricule}`, series);
  }

  const apiCounts = { 1: 0, 2: 0 };
  for (const series of apiSeries.values()) apiCounts[series]++;

  console.log(`API Sénat : ${senators.length} sénateurs`);
  console.log(`  série 1 : ${apiCounts[1]}`);
  console.log(`  série 2 : ${apiCounts[2]}`);
  if (unparsableSeries > 0) {
    console.log(`  série illisible : ${unparsableSeries}`);
  }

  const mandates = await db.mandate.findMany({
    where: { type: "SENATEUR", isCurrent: true },
    select: {
      externalId: true,
      startDate: true,
      constituency: true,
      senateSeries: true,
      source: true,
      politician: { select: { fullName: true } },
    },
    orderBy: { startDate: "asc" },
  });

  const stale: string[] = [];
  let staleOutsideSyncReach = 0;
  const missingInDb = new Set(apiSeries.keys());
  const seriesNotStored: string[] = [];
  const implausible: AuditRow[] = [];
  const dbCounts = { 1: 0, 2: 0 };

  for (const mandate of mandates) {
    const series = mandate.externalId ? apiSeries.get(mandate.externalId) : undefined;

    if (!series) {
      // Marked current in the database but absent from the API: seat since vacated.
      // The source matters: the sync's closing step is scoped to source = SENAT, so
      // a mandate from any other lineage stays current forever, no matter how many
      // times sync:senat runs.
      stale.push(
        `${mandate.politician.fullName} (${mandate.constituency ?? "circonscription inconnue"}) ` +
          `source=${mandate.source ?? "inconnue"}`
      );
      if (mandate.source !== "SENAT") staleOutsideSyncReach++;
      continue;
    }

    missingInDb.delete(mandate.externalId!);
    dbCounts[series]++;

    if (mandate.senateSeries !== series) {
      seriesNotStored.push(
        `${mandate.politician.fullName} : base=${mandate.senateSeries ?? "absente"}, API=${series}`
      );
    }

    const termStart = getSeriesTermStart(series);
    if (mandate.startDate < termStart) {
      implausible.push({
        fullName: mandate.politician.fullName,
        constituency: mandate.constituency,
        series,
        startDate: mandate.startDate,
        termStart,
      });
    }
  }

  console.log(`\nBase : ${mandates.length} mandats sénatoriaux courants`);
  console.log(
    `  appariés à l'API : ${dbCounts[1] + dbCounts[2]} (série 1 : ${dbCounts[1]}, série 2 : ${dbCounts[2]})`
  );

  console.log(`\n--- Séries non stockées ou divergentes : ${seriesNotStored.length} ---`);
  if (seriesNotStored.length > 0) {
    console.log("  Rejouer `npm run sync:senat` pour les renseigner.");
    if (verbose) for (const line of seriesNotStored) console.log(`  ${line}`);
  }

  console.log(`\n--- Mandats courants absents de l'API : ${stale.length} ---`);
  if (stale.length > 0) {
    console.log("  Sièges probablement libérés : isCurrent à revoir.");
    for (const line of stale) console.log(`  ${line}`);
    if (staleOutsideSyncReach > 0) {
      console.log(
        `  Dont ${staleOutsideSyncReach} hors source SENAT : l'étape de fermeture du sync ` +
          "étant filtrée sur cette source, elle ne les verra jamais. Les rejouer ne suffit pas, " +
          "et leur attribuer une date de fin aujourd'hui inventerait la date de départ."
      );
    }
  }

  console.log(`\n--- Sénateurs de l'API sans mandat courant en base : ${missingInDb.size} ---`);
  if (missingInDb.size > 0) {
    for (const externalId of missingInDb) console.log(`  ${externalId}`);
  }

  console.log(`\n--- Dates de début invraisemblables : ${implausible.length} ---`);
  console.log("  Un sénateur ne peut pas occuper son siège avant que sa série ne l'ait pourvu.");
  if (implausible.length > 0) {
    const bySeries = { 1: 0, 2: 0 };
    for (const row of implausible) bySeries[row.series]++;
    console.log(`  série 1 : ${bySeries[1]} sur ${dbCounts[1]}`);
    console.log(`  série 2 : ${bySeries[2]} sur ${dbCounts[2]}`);
    console.log(
      "  Ces dates viennent du repli de série, pas d'une source individuelle. Elles ne " +
        "seront pas corrigées par un simple sync:senat, qui préserve toute date existante."
    );
    const shown = verbose ? implausible : implausible.slice(0, 10);
    for (const row of shown) {
      console.log(
        `  ${row.fullName} (${row.constituency ?? "?"}) série ${row.series} : ` +
          `${formatDate(row.startDate)} < ${formatDate(row.termStart)}`
      );
    }
    if (!verbose && implausible.length > shown.length) {
      console.log(
        `  ... et ${implausible.length - shown.length} autres (--verbose pour tout voir)`
      );
    }
  }

  console.log(
    "\nTant que ces dates ne sont pas corrigées, aucune surface publique ne doit rendre " +
      "« sénateur depuis <startDate> » pour la série 1."
  );

  await db.$disconnect();
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error("Erreur:", error);
    await db.$disconnect();
    process.exit(1);
  });
}
