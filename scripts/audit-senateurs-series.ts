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
 * It deliberately does NOT flag "start date earlier than the series renewal" as
 * wrong: a re-elected senator legitimately carries an older date (95 of the 170
 * series-1 seats went to a re-elected senator in 2023). What it flags is a date
 * sitting on one of the two exact values the fallback could write, which makes its
 * provenance indistinguishable from the fallback.
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
  impossibleForSeries: boolean;
}

/** The two exact values the broken series fallback could ever write. */
const FALLBACK_TIMESTAMPS = new Set<number>([
  getSeriesTermStart(1).getTime(),
  getSeriesTermStart(2).getTime(),
]);

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
  const onFallbackDate: AuditRow[] = [];
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

    // The fallback wrote one of two exact timestamps. A date sitting precisely on
    // one of them is indistinguishable from it, whatever its real provenance: that
    // is what needs checking, not "earlier than the renewal". A re-elected senator
    // legitimately carries a date older than their series' last renewal (95 of the
    // 170 series-1 seats were held by a re-elected senator in 2023), so an earlier
    // date proves nothing on its own.
    if (FALLBACK_TIMESTAMPS.has(mandate.startDate.getTime())) {
      onFallbackDate.push({
        fullName: mandate.politician.fullName,
        constituency: mandate.constituency,
        series,
        startDate: mandate.startDate,
        // A series-1 seat was never renewed on 1 October 2020, so that value cannot
        // be an election-driven start for this series.
        impossibleForSeries: mandate.startDate.getTime() !== getSeriesTermStart(series).getTime(),
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

  console.log(
    `\n--- Dates de début dont la provenance reste à vérifier : ${onFallbackDate.length} sur ${dbCounts[1] + dbCounts[2]} ---`
  );
  console.log(
    "  Ces dates valent exactement une des deux valeurs que le repli de série écrivait.\n" +
      "  Certaines sont donc peut-être justes : elles sont seulement indiscernables du repli.\n" +
      "  Un sénateur réélu porte légitimement une date antérieure au dernier renouvellement\n" +
      "  de sa série, donc « antérieure au renouvellement » ne prouve rien en soi."
  );
  if (onFallbackDate.length > 0) {
    const bySeries = { 1: 0, 2: 0 };
    const impossible = { 1: 0, 2: 0 };
    for (const row of onFallbackDate) {
      bySeries[row.series]++;
      if (row.impossibleForSeries) impossible[row.series]++;
    }
    for (const series of [1, 2] as const) {
      console.log(
        `  série ${series} : ${bySeries[series]} sur ${dbCounts[series]}, dont ` +
          `${impossible[series]} portant une date qui n'est pas une prise de fonction de cette série`
      );
    }
    console.log(
      "  Une concentration sur un seul jour n'est pas une distribution de réélections :\n" +
        "  c'est la signature du repli. Aucun sync:senat ne la corrigera, il préserve\n" +
        "  toute date existante. Voir l'issue #698."
    );
    const shown = verbose ? onFallbackDate : onFallbackDate.slice(0, 10);
    for (const row of shown) {
      console.log(
        `  ${row.fullName} (${row.constituency ?? "?"}) série ${row.series} : ` +
          `${formatDate(row.startDate)}${row.impossibleForSeries ? " (impossible pour cette série)" : ""}`
      );
    }
    if (!verbose && onFallbackDate.length > shown.length) {
      console.log(
        `  ... et ${onFallbackDate.length - shown.length} autres (--verbose pour tout voir)`
      );
    }
  }

  console.log(
    "\nAucune surface publique ne doit rendre « sénateur depuis <startDate> » tant que la\n" +
      "provenance de ces dates n'est pas établie, séries 1 et 2 confondues."
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
