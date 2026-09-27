/**
 * Switch the series-2 Senate mandates on 1 October 2026.
 *
 * Usage:
 *   npm run senatoriales:apply-mandates              # dry run, at any date
 *   npm run senatoriales:apply-mandates -- --apply   # from 1 October, 64 constituencies published
 *
 * Reads the outgoing seats from the pre-ballot snapshot and the elected people from the
 * imported results (`senatoriales:import-results`). Closes the non re-elected outgoing
 * mandates on 30 September, renews the re-elected ones and opens a mandate for each newcomer
 * linked to a record. Elected people with no record are listed, never guessed. Everything
 * is written in one transaction.
 *
 * Running it again is safe: 2026 terms already open are left alone, so the second run only
 * opens the mandates of people linked since the first one.
 *
 * Elected people listed "à la main" (no record linked by the import):
 *   1. find or create their record, checking it is the same person (birth date, commune);
 *   2. set `Candidacy.politicianId` on their row of `senatoriales-2026`;
 *   3. run this script again with `--apply`, which opens their 2026 term;
 *   4. only then run `sync:senat`: until every elected person is linked and their term open,
 *      the Senate sync skips them, closes nothing and reports the run as failed.
 */

import "dotenv/config";
import { db } from "../src/lib/db";
import { MandateType } from "../src/generated/prisma";
import { getSenatorialesResults } from "../src/lib/data/senatoriales";
import {
  OutgoingSenateCompositionSchema,
  SENATE_OUTGOING_COMPOSITION_KEY,
} from "../src/types/stats-snapshots";
import {
  TERM_2026_START,
  assertReadyToSwitch,
  closedMandatePatch,
  planMandates,
  renewedMandateData,
} from "./lib/senatoriales-mandates-plan";

const FEHF_CONSTITUENCY = "Français établis hors de France";
const apply = process.argv.includes("--apply");

async function main() {
  const results = await getSenatorialesResults();
  if (apply) assertReadyToSwitch(new Date(), results.proclaimedConstituencies);

  const snapshot = await db.statsSnapshot.findUnique({
    where: { key: SENATE_OUTGOING_COMPOSITION_KEY },
  });
  if (!snapshot) throw new Error(`Snapshot ${SENATE_OUTGOING_COMPOSITION_KEY} introuvable`);
  const outgoing = OutgoingSenateCompositionSchema.parse(snapshot.data).seats;

  const current = await db.mandate.findMany({
    where: {
      type: MandateType.SENATEUR,
      isCurrent: true,
      senateSeries: 2,
      startDate: { lt: TERM_2026_START },
      politicianId: { in: outgoing.map((s) => s.politicianId) },
    },
    select: {
      id: true,
      politicianId: true,
      title: true,
      constituency: true,
      departmentCode: true,
      externalId: true,
      sourceUrl: true,
      officialUrl: true,
    },
  });
  const currentById = new Map(current.map((m) => [m.id, m]));
  const opened = await db.mandate.findMany({
    where: { type: MandateType.SENATEUR, isCurrent: true, startDate: { gte: TERM_2026_START } },
    select: { politicianId: true },
  });
  const electedById = new Map(
    results.elected.filter((e) => e.politicianId).map((e) => [e.politicianId!, e])
  );

  const actions = planMandates({
    elected: results.elected,
    outgoing,
    currentSeries2Mandates: current.map((m) => ({ id: m.id, politicianId: m.politicianId })),
    alreadyOpened: new Set(opened.map((m) => m.politicianId)),
  });

  const count = (kind: string) => actions.filter((a) => a.kind === kind).length;
  console.log(`\n${apply ? "APPLICATION" : "DRY RUN (rien n'est écrit)"}`);
  console.log(
    `Circonscriptions publiées : ${results.proclaimedConstituencies} sur 64. ` +
      `Fermetures : ${count("close")}, renouvellements : ${count("renew")}, ` +
      `ouvertures : ${count("open")}, à traiter à la main : ${count("manual")}.`
  );
  for (const a of actions) {
    if (a.kind === "manual") console.log(`  À la main : ${a.name} (${a.constituencyCode})`);
  }

  if (!apply) {
    await db.$disconnect();
    return;
  }

  // About 320 sequential statements: well beyond the default interactive timeout.
  await db.$transaction(
    async (tx) => {
      for (const a of actions) {
        if (a.kind === "close") {
          await tx.mandate.update({
            where: { id: a.mandateId },
            data: closedMandatePatch({ transferExternalId: false }),
          });
        } else if (a.kind === "renew") {
          const old = currentById.get(a.closeMandateId)!;
          await tx.mandate.update({
            where: { id: old.id },
            data: closedMandatePatch({ transferExternalId: true }),
          });
          await tx.mandate.create({ data: renewedMandateData(old) });
        } else if (a.kind === "open") {
          const e = electedById.get(a.politicianId)!;
          const constituency = a.departmentCode === null ? FEHF_CONSTITUENCY : e.constituencyName;
          await tx.mandate.create({
            data: {
              politicianId: a.politicianId,
              type: MandateType.SENATEUR,
              institution: "Sénat",
              title: `${e.gender === "F" ? "Sénatrice" : "Sénateur"} ${constituency}`,
              constituency,
              departmentCode: a.departmentCode,
              senateSeries: 2,
              startDate: TERM_2026_START,
              isCurrent: true,
              source: "SENAT",
            },
          });
        }
      }
    },
    { timeout: 120_000, maxWait: 10_000 }
  );
  console.log("Bascule appliquée.");
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
