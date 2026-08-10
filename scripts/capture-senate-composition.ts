/**
 * Capture the Senate's composition as it stands before the 27 September 2026 ballot.
 *
 * Write-once, and the only record of a state that stops existing. Every read of the
 * Senate goes through `Mandate` with `isCurrent = true`, so the first `sync:senat`
 * after the ballot swaps the 178 outgoing senators for the incoming ones. Nothing then
 * reconstructs who stood for re-election, which is what the post-ballot comparison
 * (re-elected, newcomers, share of women) is made of.
 *
 * Everything runs inside a single REPEATABLE READ transaction: the existence check, the
 * two counts, the read of the 178 seats, the group aggregation and the write. Spread
 * across independent queries, a concurrent `sync:senat` could close a mandate between
 * the count and the read, and the capture would freeze a composition that never existed
 * at any single instant. The unique constraint on `StatsSnapshot.key` is the last line
 * of defence against two captures racing each other.
 *
 * Three refusals, because a wrong capture is worse than no capture:
 *
 *  1. If the key already exists, stop. Never an upsert: a second run must not quietly
 *     replace the record with a post-ballot one. Deleting the row is a deliberate act.
 *  2. If the database does not hold exactly 348 sitting senators with 178 in the
 *     renewed series, stop.
 *  3. If the control invariants of #700 do not hold, stop, and write nothing.
 *
 * Usage:
 *   npm run senat:capture-composition -- --dry-run
 *   npm run senat:capture-composition
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
  summariseOutgoingMajority,
  verifyComposition,
} from "../src/lib/senatoriales/outgoing-composition";

const RENEWED_SERIES = 2;

/** Raised inside the transaction so a refusal rolls back rather than half-writes. */
class CaptureRefused extends Error {
  constructor(
    message: string,
    readonly details: string[] = []
  ) {
    super(message);
    this.name = "CaptureRefused";
  }
}

/**
 * Raised to roll back a successful dry run. A distinct type rather than a refusal with
 * no details: inferring success from an empty detail list would exit 0 on a real
 * refusal that happens to carry none.
 */
class DryRunComplete extends Error {
  constructor(readonly composition: OutgoingSenateComposition) {
    super("dry run");
    this.name = "DryRunComplete";
  }
}

/**
 * The transaction client of an *extended* Prisma client, which is not
 * `Prisma.TransactionClient`: the extension changes the model types, so the plain
 * interface no longer matches. Derived from `db` by removing what a transaction
 * forbids.
 */
type Tx = Omit<
  typeof db,
  "$transaction" | "$connect" | "$disconnect" | "$on" | "$use" | "$extends"
>;

async function readComposition(tx: Tx, capturedAt: Date): Promise<OutgoingSenateComposition> {
  const [totalSeats, seatsAtStake] = await Promise.all([
    tx.mandate.count({ where: { type: "SENATEUR", isCurrent: true } }),
    tx.mandate.count({
      where: { type: "SENATEUR", isCurrent: true, senateSeries: RENEWED_SERIES },
    }),
  ]);

  const mandates = await tx.mandate.findMany({
    where: { type: "SENATEUR", isCurrent: true, senateSeries: RENEWED_SERIES },
    select: {
      departmentCode: true,
      constituency: true,
      senateSeries: true,
      politician: { select: { id: true, slug: true, fullName: true } },
      parliamentaryData: {
        select: { parliamentaryGroup: { select: { code: true, name: true, shortName: true } } },
      },
    },
    orderBy: { politician: { lastName: "asc" } },
  });

  const groups = await tx.$queryRaw<
    Array<{
      groupCode: string;
      groupName: string;
      shortName: string | null;
      held: number;
      atStake: number;
    }>
  >(Prisma.sql`
    SELECT g.code AS "groupCode",
           g.name AS "groupName",
           g."shortName",
           COUNT(*)::int AS held,
           COUNT(*) FILTER (WHERE m."senateSeries" = ${RENEWED_SERIES})::int AS "atStake"
    FROM "Mandate" m
    JOIN "MandateParliamentary" mp ON mp."mandateId" = m.id
    JOIN "ParliamentaryGroup" g ON g.id = mp."parliamentaryGroupId"
    WHERE m.type = 'SENATEUR'
      AND m."isCurrent" = true
      AND m."senateSeries" IS NOT NULL
    GROUP BY 1, 2, 3
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
      groupCode: m.parliamentaryData?.parliamentaryGroup.code ?? null,
      groupName: m.parliamentaryData?.parliamentaryGroup.name ?? null,
      groupShortName: m.parliamentaryData?.parliamentaryGroup.shortName ?? null,
    })),
    groups,
  };
}

function report(composition: OutgoingSenateComposition): void {
  console.log(`Sénateurs en cours de mandat : ${composition.totalSeats}`);
  console.log(`Sièges de la série renouvelée : ${composition.seatsAtStake}`);
  console.log(`Sièges capturés individuellement : ${composition.seats.length}\n`);
  console.log("Exposition par groupe :");
  for (const group of composition.groups) {
    console.log(
      `  ${group.groupCode.padEnd(8)} ${String(group.atStake).padStart(3)} / ${String(group.held).padStart(3)}  ${group.groupName}`
    );
  }
  const majority = summariseOutgoingMajority(composition);
  console.log(`  majorité sortante : ${majority.atStake} sur ${majority.held}`);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`=== Capture de la composition sortante du Sénat ${dryRun ? "(à blanc)" : ""} ===\n`);

  const capturedAt = new Date();

  try {
    const composition = await db.$transaction(
      async (tx) => {
        // 1. Write-once, checked inside the transaction so a concurrent run cannot
        //    slip between the check and the insert.
        const existing = await tx.statsSnapshot.findUnique({
          where: { key: SENATE_OUTGOING_COMPOSITION_KEY },
          select: { computedAt: true },
        });
        if (existing) {
          throw new CaptureRefused(
            `La composition sortante est déjà capturée (${existing.computedAt.toISOString()}).\n` +
              `Clé : ${SENATE_OUTGOING_COMPOSITION_KEY}\n\n` +
              `Ce script n'écrase jamais une capture existante : elle est le seul témoignage\n` +
              `d'un état qui n'existe plus. Pour refaire la photographie, supprimer la ligne\n` +
              `délibérément, après avoir vérifié que le scrutin n'a pas encore eu lieu.`
          );
        }

        const candidate = await readComposition(tx, capturedAt);
        report(candidate);

        // 2. The database must match the Senate before anything is frozen.
        if (
          candidate.totalSeats !== EXPECTED_TOTAL_SEATS ||
          candidate.seatsAtStake !== EXPECTED_SEATS_AT_STAKE
        ) {
          throw new CaptureRefused(
            `Base non conforme : ${candidate.totalSeats} mandats courants et ` +
              `${candidate.seatsAtStake} sièges de série renouvelée, attendu ` +
              `${EXPECTED_TOTAL_SEATS} et ${EXPECTED_SEATS_AT_STAKE}.\n` +
              `Lancer \`npm run audit:senateurs-series -- --verbose\` avant de recommencer.`
          );
        }

        // 3. Control invariants, recomputed and never assumed.
        const problems = verifyComposition(candidate);
        if (problems.length > 0) {
          throw new CaptureRefused(
            `${problems.length} invariant(s) non tenu(s), rien n'est écrit :`,
            problems
          );
        }
        console.log("\nTous les invariants de contrôle sont tenus.");

        // Parsed before the write, not only on read: a shape error must surface while
        // the state it describes still exists.
        const parsed = OutgoingSenateCompositionSchema.parse(candidate);

        if (dryRun) throw new DryRunComplete(parsed);

        await tx.statsSnapshot.create({
          data: {
            key: SENATE_OUTGOING_COMPOSITION_KEY,
            data: parsed as unknown as Prisma.InputJsonValue,
          },
        });

        return parsed;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );

    console.log(
      `\nCapture écrite sous ${SENATE_OUTGOING_COMPOSITION_KEY} ` +
        `(${composition.seats.length} sièges, ${composition.capturedAt}).`
    );
    await db.$disconnect();
  } catch (error) {
    if (error instanceof DryRunComplete) {
      console.log(
        `\nÀ blanc : ${error.composition.seats.length} sièges seraient capturés, ` +
          "aucune écriture. Relancer sans --dry-run pour capturer."
      );
      await db.$disconnect();
      return;
    }
    if (error instanceof CaptureRefused) {
      console.error(`\n${error.message}`);
      for (const detail of error.details) console.error(`  - ${detail}`);
      await db.$disconnect();
      process.exit(1);
    }
    throw error;
  }
}

main().catch(async (error) => {
  console.error("Erreur:", error);
  await db.$disconnect();
  process.exit(1);
});
