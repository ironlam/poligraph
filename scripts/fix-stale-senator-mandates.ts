/**
 * One-shot: close three senatorial mandates still marked current.
 *
 * Éric Bocquet, Philippe Bas and Maurice Perrion left the Senate between October 2024
 * and March 2025, but their mandate row still carries `isCurrent = true` with no end
 * date. They come from the Wikidata lineage (`source = WIKIDATA`) and their profiles
 * hold no Senate external id, while the closing step of `syncSenateurs()` is scoped to
 * `source: DataSource.SENAT` and keys on that id. No amount of syncing will ever reach
 * them.
 *
 * They were left alone in #697 because stamping today's date as their departure would
 * have replaced one wrong value with another. Each end date below is read from the
 * senator's own page on senat.fr, with its stated reason.
 *
 * This blocks #700: a capture of the outgoing composition taken now would record three
 * seats that do not exist.
 *
 * Deliberately narrow. It does not touch `startDate`, and it settles nothing about the
 * provenance of the other 338 dates: that is #698.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/fix-stale-senator-mandates.ts --dry-run
 *   npx tsx --env-file=.env scripts/fix-stale-senator-mandates.ts
 */

import "dotenv/config";
import { db } from "../src/lib/db";

interface Closure {
  slug: string;
  fullName: string;
  /** End of term, as published by the Senate. */
  endDate: string;
  reason: string;
  sourceUrl: string;
}

const CLOSURES: Closure[] = [
  {
    slug: "eric-bocquet",
    fullName: "Eric Bocquet",
    endDate: "2024-10-31",
    reason: "démissionnaire",
    sourceUrl: "https://www.senat.fr/senateur/bocquet_eric11040e.html",
  },
  {
    slug: "philippe-bas",
    fullName: "Philippe Bas",
    endDate: "2025-03-01",
    reason: "nommé membre du Conseil constitutionnel",
    sourceUrl: "https://www.senat.fr/senateur/bas_philippe05008e.html",
  },
  {
    slug: "maurice-perrion",
    fullName: "Maurice Perrion",
    endDate: "2025-01-23",
    reason: "reprise de l'exercice du mandat par un ancien membre du Gouvernement",
    sourceUrl: "https://www.senat.fr/senateur/perrion_maurice21420g.html",
  },
];

/** What the database must look like once these three are closed. */
const EXPECTED_CURRENT = 348;
const EXPECTED_SERIES_1 = 170;
const EXPECTED_SERIES_2 = 178;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`=== Fermeture des mandats sénatoriaux périmés ${dryRun ? "(à blanc)" : ""} ===\n`);

  const before = await db.mandate.count({ where: { type: "SENATEUR", isCurrent: true } });
  console.log(`Mandats sénatoriaux courants avant : ${before}\n`);

  let closed = 0;

  for (const closure of CLOSURES) {
    const mandates = await db.mandate.findMany({
      where: {
        type: "SENATEUR",
        isCurrent: true,
        politician: { slug: closure.slug },
      },
      select: { id: true, startDate: true, source: true },
    });

    if (mandates.length === 0) {
      console.log(`  ~ ${closure.fullName} : aucun mandat courant, déjà fermé`);
      continue;
    }
    if (mandates.length > 1) {
      throw new Error(
        `${closure.fullName} porte ${mandates.length} mandats courants : cas non prévu, arrêt.`
      );
    }

    const mandate = mandates[0]!;
    const endDate = new Date(`${closure.endDate}T00:00:00Z`);
    if (endDate < mandate.startDate) {
      throw new Error(
        `${closure.fullName} : date de fin ${closure.endDate} antérieure au début ` +
          `${mandate.startDate.toISOString().slice(0, 10)}, arrêt.`
      );
    }

    console.log(
      `  + ${closure.fullName} : fin au ${closure.endDate} (${closure.reason}), source=${mandate.source}`
    );
    console.log(`      ${closure.sourceUrl}`);

    if (!dryRun) {
      await db.mandate.update({
        where: { id: mandate.id },
        data: { isCurrent: false, endDate },
      });
    }
    closed++;
  }

  if (dryRun) {
    console.log(`\nÀ blanc : ${closed} mandat(s) seraient fermés. Aucune écriture.`);
    await db.$disconnect();
    return;
  }

  // Control invariant: the database must now match the Senate exactly.
  const [current, series1, series2] = await Promise.all([
    db.mandate.count({ where: { type: "SENATEUR", isCurrent: true } }),
    db.mandate.count({ where: { type: "SENATEUR", isCurrent: true, senateSeries: 1 } }),
    db.mandate.count({ where: { type: "SENATEUR", isCurrent: true, senateSeries: 2 } }),
  ]);

  console.log(`\n${closed} mandat(s) fermés.`);
  console.log(`Mandats sénatoriaux courants : ${current} (attendu ${EXPECTED_CURRENT})`);
  console.log(`  série 1 : ${series1} (attendu ${EXPECTED_SERIES_1})`);
  console.log(`  série 2 : ${series2} (attendu ${EXPECTED_SERIES_2})`);

  const ok =
    current === EXPECTED_CURRENT && series1 === EXPECTED_SERIES_1 && series2 === EXPECTED_SERIES_2;
  console.log(
    ok
      ? "\nInvariant tenu : la base correspond à l'open data du Sénat."
      : "\nInvariant NON tenu : relancer `npm run audit:senateurs-series -- --verbose`."
  );

  await db.$disconnect();
  if (!ok) process.exit(1);
}

main().catch(async (error) => {
  console.error("Erreur:", error);
  await db.$disconnect();
  process.exit(1);
});
