#!/usr/bin/env tsx
/**
 * Clean up historical Affair.partyAtTime anomalies (GH issue #303).
 *
 * Symptom: some affairs have partyAtTimeId pointing at a Party whose
 * foundedDate is AFTER the affair's factsDate — an impossible "historical"
 * attribution. Root cause is historical: no current code path writes this
 * column, so the bad values came from a now-deleted moderation script or
 * direct Prisma Studio edits.
 *
 * Strategy per anomalous row:
 *   1. Look up the politician's PartyMembership rows overlapping factsDate.
 *   2. If exactly ONE membership matches, replace partyAtTimeId with its partyId.
 *   3. If ZERO match, null out partyAtTimeId (UI falls back to currentParty).
 *   4. If MULTIPLE match, null out and log for manual moderator follow-up.
 *
 * Usage:
 *   npx dotenv -e .env -- npx tsx scripts/fix-affair-party-at-time.ts           # dry-run
 *   npx dotenv -e .env -- npx tsx scripts/fix-affair-party-at-time.ts --apply   # write changes
 */
import { db } from "@/lib/db";
import { validatePartyAtTime } from "@/lib/affairs/party-at-time-validation";

const APPLY = process.argv.includes("--apply");

interface AnomalyRow {
  affairId: string;
  affairPublicId: string | null;
  affairTitle: string;
  factsDate: Date;
  politicianId: string;
  politicianFullName: string;
  partyAtTimeId: string;
  partyAtTimeName: string;
  partyAtTimeFoundedDate: Date;
}

async function main() {
  console.log(
    APPLY
      ? "=== fix-affair-party-at-time (APPLY mode, writes to DB) ==="
      : "=== fix-affair-party-at-time (DRY RUN — add --apply to persist) ==="
  );

  // 1. Find all affairs where factsDate precedes partyAtTime.foundedDate.
  //    Using $queryRaw because the comparison spans two tables.
  const anomalies = await db.$queryRaw<AnomalyRow[]>`
    SELECT
      a.id AS "affairId",
      a."publicId" AS "affairPublicId",
      a.title AS "affairTitle",
      a."factsDate" AS "factsDate",
      a."politicianId" AS "politicianId",
      p."fullName" AS "politicianFullName",
      a."partyAtTimeId" AS "partyAtTimeId",
      pt.name AS "partyAtTimeName",
      pt."foundedDate" AS "partyAtTimeFoundedDate"
    FROM "Affair" a
    JOIN "Politician" p ON p.id = a."politicianId"
    JOIN "Party" pt ON pt.id = a."partyAtTimeId"
    WHERE a."factsDate" IS NOT NULL
      AND pt."foundedDate" IS NOT NULL
      AND a."factsDate" < pt."foundedDate"
    ORDER BY a."factsDate" ASC
  `;

  console.log(`\nFound ${anomalies.length} anomalous affairs.\n`);

  if (anomalies.length === 0) {
    console.log("Nothing to fix.");
    return;
  }

  // 2. For each anomaly, try to recover the correct historical party.
  let rewrittenToCorrect = 0;
  let nulledOutNoMembership = 0;
  let nulledOutAmbiguous = 0;

  for (const row of anomalies) {
    // Double-check with the validation helper (defence in depth — catches
    // any future relaxation of the SQL filter).
    const check = validatePartyAtTime({
      factsDate: row.factsDate,
      partyFoundedDate: row.partyAtTimeFoundedDate,
    });
    if (check.valid) continue;

    // Find PartyMembership rows active at factsDate for this politician.
    const candidates = await db.partyMembership.findMany({
      where: {
        politicianId: row.politicianId,
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: row.factsDate } }] },
          { OR: [{ endDate: null }, { endDate: { gte: row.factsDate } }] },
        ],
      },
      select: {
        party: {
          select: {
            id: true,
            name: true,
            foundedDate: true,
          },
        },
      },
    });

    // Filter out candidate parties that themselves fail the chronology rule
    // (belt-and-braces; a membership should never point at a post-dated party
    // but the data is sketchy so we re-validate).
    const validCandidates = candidates.filter(
      (c) =>
        validatePartyAtTime({
          factsDate: row.factsDate,
          partyFoundedDate: c.party.foundedDate,
        }).valid
    );

    const uniquePartyIds = Array.from(new Set(validCandidates.map((c) => c.party.id)));

    const dateStr = row.factsDate.toISOString().slice(0, 10);
    const titlePreview = row.affairTitle.slice(0, 55);

    if (uniquePartyIds.length === 1) {
      const correctParty = validCandidates.find((c) => c.party.id === uniquePartyIds[0])!.party;
      console.log(`  ${row.affairPublicId ?? row.affairId}  ${dateStr}  "${titlePreview}"`);
      console.log(`    ${row.politicianFullName}: ${row.partyAtTimeName} -> ${correctParty.name}`);
      if (APPLY) {
        await db.affair.update({
          where: { id: row.affairId },
          data: { partyAtTimeId: correctParty.id },
        });
      }
      rewrittenToCorrect++;
    } else if (uniquePartyIds.length === 0) {
      console.log(`  ${row.affairPublicId ?? row.affairId}  ${dateStr}  "${titlePreview}"`);
      console.log(
        `    ${row.politicianFullName}: ${row.partyAtTimeName} -> NULL (no PartyMembership covers factsDate)`
      );
      if (APPLY) {
        await db.affair.update({
          where: { id: row.affairId },
          data: { partyAtTimeId: null },
        });
      }
      nulledOutNoMembership++;
    } else {
      const names = Array.from(new Set(validCandidates.map((c) => c.party.name))).join(", ");
      console.log(`  ${row.affairPublicId ?? row.affairId}  ${dateStr}  "${titlePreview}"`);
      console.log(
        `    ${row.politicianFullName}: ${row.partyAtTimeName} -> NULL (ambiguous, candidates: ${names})`
      );
      if (APPLY) {
        await db.affair.update({
          where: { id: row.affairId },
          data: { partyAtTimeId: null },
        });
      }
      nulledOutAmbiguous++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Rewritten to correct historical party: ${rewrittenToCorrect}`);
  console.log(`  Nulled out (no PartyMembership):       ${nulledOutNoMembership}`);
  console.log(`  Nulled out (ambiguous membership):     ${nulledOutAmbiguous}`);
  console.log(`  Total processed:                       ${anomalies.length}`);
  if (!APPLY) {
    console.log(`\n  (dry run — re-run with --apply to persist)`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
