#!/usr/bin/env tsx
/**
 * Create PostgreSQL sequences that back the poligraphId generator.
 *
 * Idempotent: safe to run multiple times. Each sequence is created with
 * IF NOT EXISTS, and the Politician sequence is aligned to the current
 * MAX(publicId) so already-assigned PG-XXXXXX values are never reused.
 *
 * Usage:
 *   npx dotenv -e .env -- npx tsx scripts/create-public-id-sequences.ts
 */
import { db } from "@/lib/db";

async function main() {
  console.log("Creating poligraphId sequences...");

  await db.$executeRaw`CREATE SEQUENCE IF NOT EXISTS poligraph_politician_seq START 1`;
  await db.$executeRaw`CREATE SEQUENCE IF NOT EXISTS poligraph_affair_seq START 1`;
  await db.$executeRaw`CREATE SEQUENCE IF NOT EXISTS poligraph_factcheck_seq START 1`;
  await db.$executeRaw`CREATE SEQUENCE IF NOT EXISTS poligraph_scrutin_seq START 1`;
  await db.$executeRaw`CREATE SEQUENCE IF NOT EXISTS poligraph_party_seq START 1`;
  await db.$executeRaw`CREATE SEQUENCE IF NOT EXISTS poligraph_election_seq START 1`;
  await db.$executeRaw`CREATE SEQUENCE IF NOT EXISTS poligraph_mandate_seq START 1`;
  await db.$executeRaw`CREATE SEQUENCE IF NOT EXISTS poligraph_dossier_seq START 1`;
  await db.$executeRaw`CREATE SEQUENCE IF NOT EXISTS poligraph_group_seq START 1`;
  await db.$executeRaw`CREATE SEQUENCE IF NOT EXISTS poligraph_electoral_list_seq START 1`;

  console.log("All sequences created (or already existed).");

  // Align Politician sequence with existing PG-XXXXXX values so the next
  // generated publicId is strictly greater than any already in use.
  const politicianMaxRows = await db.$queryRaw<{ max: string | null }[]>`
    SELECT MAX(CAST(SUBSTRING("publicId" FROM '[0-9]+') AS BIGINT))::text AS max
    FROM "Politician"
    WHERE "publicId" LIKE 'PG-%'
  `;
  const currentMax = politicianMaxRows[0]?.max ? parseInt(politicianMaxRows[0].max, 10) : 0;

  if (currentMax > 0) {
    await db.$executeRaw`SELECT setval('poligraph_politician_seq', ${currentMax})`;
    console.log(
      `Politician sequence aligned to ${currentMax} (next: PG-${String(currentMax + 1).padStart(6, "0")})`
    );
  } else {
    console.log("No existing Politician publicIds found; sequence left at 1");
  }

  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
