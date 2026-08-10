/**
 * Capture the Senate's composition as it stands before the 27 September 2026 ballot.
 *
 * Write-once, and the only record of a state that stops existing. Every read of the
 * Senate goes through `Mandate` with `isCurrent = true`, so the first `sync:senat`
 * after the ballot swaps the 178 outgoing senators for the incoming ones. Nothing then
 * reconstructs who stood for re-election, which is what the post-ballot comparison
 * (re-elected, newcomers, share of women) is made of.
 *
 * Three refusals rather than one, because a wrong capture is worse than no capture:
 *
 *  1. If the key already exists, stop. Never an upsert: a second run must not quietly
 *     replace the record with a post-ballot one. Deleting the row is a deliberate act.
 *  2. If the database does not hold exactly 348 sitting senators with 178 in the
 *     renewed series, stop. A capture taken mid-sync would freeze an incomplete state.
 *  3. If the control invariants of #700 do not hold, stop, and write nothing.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/capture-senate-composition.ts --dry-run
 *   npx tsx --env-file=.env scripts/capture-senate-composition.ts
 */

import "dotenv/config";
import { db } from "../src/lib/db";
import { Prisma } from "../src/generated/prisma";
import {
  SENATE_OUTGOING_COMPOSITION_KEY,
  OutgoingSenateCompositionSchema,
  type OutgoingSenateComposition,
} from "../src/types/stats-snapshots";
import {
  EXPECTED_SEATS_AT_STAKE,
  EXPECTED_TOTAL_SEATS,
  verifyComposition,
} from "../src/lib/senatoriales/outgoing-composition";

const RENEWED_SERIES = 2;

async function buildComposition(capturedAt: Date): Promise<OutgoingSenateComposition> {
  const [totalSeats, seatsAtStake] = await Promise.all([
    db.mandate.count({ where: { type: "SENATEUR", isCurrent: true } }),
    db.mandate.count({
      where: { type: "SENATEUR", isCurrent: true, senateSeries: RENEWED_SERIES },
    }),
  ]);

  const mandates = await db.mandate.findMany({
    where: { type: "SENATEUR", isCurrent: true, senateSeries: RENEWED_SERIES },
    select: {
      departmentCode: true,
      constituency: true,
      senateSeries: true,
      politician: { select: { id: true, slug: true, fullName: true } },
      parliamentaryData: {
        select: { parliamentaryGroup: { select: { name: true, shortName: true } } },
      },
    },
    orderBy: { politician: { lastName: "asc" } },
  });

  const groups = await db.$queryRaw<
    Array<{ groupName: string; shortName: string | null; held: number; atStake: number }>
  >(Prisma.sql`
    SELECT g.name AS "groupName",
           g."shortName",
           COUNT(*)::int AS held,
           COUNT(*) FILTER (WHERE m."senateSeries" = ${RENEWED_SERIES})::int AS "atStake"
    FROM "Mandate" m
    JOIN "MandateParliamentary" mp ON mp."mandateId" = m.id
    JOIN "ParliamentaryGroup" g ON g.id = mp."parliamentaryGroupId"
    WHERE m.type = 'SENATEUR'
      AND m."isCurrent" = true
      AND m."senateSeries" IS NOT NULL
    GROUP BY 1, 2
    ORDER BY held DESC
  `);

  return {
    capturedAt: capturedAt.toISOString(),
    totalSeats,
    seatsAtStake,
    seats: mandates.map((m) => ({
      politicianId: m.politician.id,
      fullName: m.politician.fullName,
      slug: m.politician.slug,
      departmentCode: m.departmentCode,
      constituency: m.constituency,
      series: m.senateSeries ?? RENEWED_SERIES,
      groupName: m.parliamentaryData?.parliamentaryGroup.name ?? null,
      groupShortName: m.parliamentaryData?.parliamentaryGroup.shortName ?? null,
    })),
    groups,
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`=== Capture de la composition sortante du Sénat ${dryRun ? "(à blanc)" : ""} ===\n`);

  // 1. Write-once.
  const existing = await db.statsSnapshot.findUnique({
    where: { key: SENATE_OUTGOING_COMPOSITION_KEY },
    select: { computedAt: true },
  });
  if (existing) {
    console.log(
      `La composition sortante est déjà capturée (${existing.computedAt.toISOString()}).\n` +
        `Clé : ${SENATE_OUTGOING_COMPOSITION_KEY}\n\n` +
        `Ce script n'écrase jamais une capture existante : elle est le seul témoignage d'un\n` +
        `état qui n'existe plus. Pour refaire la photographie, supprimer la ligne\n` +
        `délibérément, après avoir vérifié que le scrutin n'a pas encore eu lieu.`
    );
    await db.$disconnect();
    process.exit(1);
  }

  const capturedAt = new Date();
  const composition = await buildComposition(capturedAt);

  console.log(`Sénateurs en cours de mandat : ${composition.totalSeats}`);
  console.log(`Sièges de la série renouvelée : ${composition.seatsAtStake}`);
  console.log(`Sièges capturés individuellement : ${composition.seats.length}\n`);

  // 2. The database must match the Senate before anything is frozen.
  if (
    composition.totalSeats !== EXPECTED_TOTAL_SEATS ||
    composition.seatsAtStake !== EXPECTED_SEATS_AT_STAKE
  ) {
    console.error(
      `Base non conforme : ${composition.totalSeats} mandats courants et ` +
        `${composition.seatsAtStake} sièges de série renouvelée, attendu ` +
        `${EXPECTED_TOTAL_SEATS} et ${EXPECTED_SEATS_AT_STAKE}.\n` +
        `Lancer \`npm run audit:senateurs-series -- --verbose\` avant de recommencer.`
    );
    await db.$disconnect();
    process.exit(1);
  }

  // 3. Control invariants, recomputed and never assumed.
  const problems = verifyComposition(composition);
  console.log("Exposition par groupe :");
  for (const group of composition.groups) {
    console.log(
      `  ${(group.shortName ?? group.groupName).padEnd(14)} ${String(group.atStake).padStart(3)} / ${String(group.held).padStart(3)}`
    );
  }

  if (problems.length > 0) {
    console.error(`\n${problems.length} invariant(s) non tenu(s), rien n'est écrit :`);
    for (const problem of problems) console.error(`  - ${problem}`);
    await db.$disconnect();
    process.exit(1);
  }
  console.log("\nTous les invariants de contrôle sont tenus.");

  // The schema is parsed before the write, not only on read: a shape error must
  // surface now, while the state it describes still exists.
  const parsed = OutgoingSenateCompositionSchema.parse(composition);

  if (dryRun) {
    console.log("\nÀ blanc : aucune écriture. Relancer sans --dry-run pour capturer.");
    await db.$disconnect();
    return;
  }

  await db.statsSnapshot.create({
    data: {
      key: SENATE_OUTGOING_COMPOSITION_KEY,
      data: parsed as unknown as Prisma.InputJsonValue,
    },
  });

  console.log(
    `\nCapture écrite sous ${SENATE_OUTGOING_COMPOSITION_KEY} ` +
      `(${parsed.seats.length} sièges, ${capturedAt.toISOString()}).`
  );
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error("Erreur:", error);
  await db.$disconnect();
  process.exit(1);
});
