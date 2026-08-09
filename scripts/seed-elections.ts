/**
 * Seed script for upcoming French elections
 *
 * Idempotent: uses upsert on slug, safe to run multiple times.
 *
 * Usage:
 *   npx tsx scripts/seed-elections.ts
 */

import "dotenv/config";
import { db } from "../src/lib/db";
import { ELECTIONS } from "./lib/elections-seed";

async function main() {
  console.log("=== Seed élections ===\n");

  let created = 0;
  let updated = 0;

  for (const election of ELECTIONS) {
    const data = {
      type: election.type,
      title: election.title,
      shortTitle: election.shortTitle,
      ...(election.description && { description: election.description }),
      scope: election.scope,
      round1Date: election.round1Date,
      round2Date: election.round2Date,
      dateConfirmed: election.dateConfirmed,
      totalSeats: election.totalSeats,
      suffrage: election.suffrage,
      ...(election.registrationDeadline && { registrationDeadline: election.registrationDeadline }),
      ...(election.candidacyOpenDate && { candidacyOpenDate: election.candidacyOpenDate }),
      ...(election.candidacyDeadline && { candidacyDeadline: election.candidacyDeadline }),
      ...(election.campaignStartDate && { campaignStartDate: election.campaignStartDate }),
      ...(election.sourceUrl && { sourceUrl: election.sourceUrl }),
      ...(election.decreeUrl && { decreeUrl: election.decreeUrl }),
    };

    const result = await db.election.upsert({
      where: { slug: election.slug },
      create: { slug: election.slug, ...data },
      update: data,
    });

    // Check if it was newly created (createdAt === updatedAt means just created)
    const isNew = result.createdAt.getTime() === result.updatedAt.getTime();
    if (isNew) {
      created++;
      console.log(`  + ${election.shortTitle} (créée)`);
    } else {
      updated++;
      console.log(`  ~ ${election.shortTitle} (mise à jour)`);
    }
  }

  console.log(`\nTerminé : ${created} créées, ${updated} mises à jour`);
}

main()
  .catch((error) => {
    console.error("Erreur:", error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
