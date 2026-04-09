#!/usr/bin/env tsx
/**
 * Backfill poligraphIds for all entity types.
 *
 * Strategy per entity:
 *   1. Compute the current MAX sequence already assigned (handles re-runs).
 *   2. Number rows missing a publicId by createdAt ASC, starting just above
 *      that max. This guarantees chronological ordering and re-run safety.
 *   3. Assign the formatted publicId in a single CTE-backed UPDATE.
 *   4. Align the PostgreSQL sequence with the new max so the runtime
 *      generator never hands out a colliding value.
 *
 * Idempotent: running this script multiple times is safe. Rows that already
 * have a publicId are skipped; newly-created rows get the next available
 * number the next time the script runs.
 *
 * Usage:
 *   npx dotenv -e .env -- npx tsx scripts/backfill-public-ids.ts
 *   npx dotenv -e .env.prod -- npx tsx scripts/backfill-public-ids.ts
 */
import { db } from "@/lib/db";

async function main() {
  console.log("Backfilling poligraphIds for all entity types...\n");

  await backfillPolitician();
  await backfillAffair();
  await backfillFactCheck();
  await backfillScrutin();
  await backfillParty();
  await backfillElection();
  await backfillMandate();
  await backfillLegislativeDossier();
  await backfillParliamentaryGroup();
  await backfillElectoralList();

  console.log("\nAll entity types backfilled.");
}

async function backfillPolitician() {
  const updated = await db.$executeRaw`
    WITH start_from AS (
      SELECT COALESCE(MAX(CAST(SUBSTRING("publicId" FROM '[0-9]+') AS BIGINT)), 0) AS val
      FROM "Politician"
      WHERE "publicId" LIKE 'PG-%'
    ),
    numbered AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) + (SELECT val FROM start_from) AS seq
      FROM "Politician"
      WHERE "publicId" IS NULL
    )
    UPDATE "Politician" t
    SET "publicId" = 'PG-' || LPAD(n.seq::text, 6, '0')
    FROM numbered n
    WHERE t.id = n.id
  `;
  const max = await currentMax("Politician", "PG");
  if (max > 0) {
    await db.$executeRaw`SELECT setval('poligraph_politician_seq', ${max})`;
  }
  console.log(`  Politician: ${updated} backfilled, max PG-${pad(max)}`);
}

async function backfillAffair() {
  const updated = await db.$executeRaw`
    WITH start_from AS (
      SELECT COALESCE(MAX(CAST(SUBSTRING("publicId" FROM '[0-9]+') AS BIGINT)), 0) AS val
      FROM "Affair"
      WHERE "publicId" LIKE 'AF-%'
    ),
    numbered AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) + (SELECT val FROM start_from) AS seq
      FROM "Affair"
      WHERE "publicId" IS NULL
    )
    UPDATE "Affair" t
    SET "publicId" = 'AF-' || LPAD(n.seq::text, 6, '0')
    FROM numbered n
    WHERE t.id = n.id
  `;
  const max = await currentMax("Affair", "AF");
  if (max > 0) {
    await db.$executeRaw`SELECT setval('poligraph_affair_seq', ${max})`;
  }
  console.log(`  Affair: ${updated} backfilled, max AF-${pad(max)}`);
}

async function backfillFactCheck() {
  const updated = await db.$executeRaw`
    WITH start_from AS (
      SELECT COALESCE(MAX(CAST(SUBSTRING("publicId" FROM '[0-9]+') AS BIGINT)), 0) AS val
      FROM "FactCheck"
      WHERE "publicId" LIKE 'FC-%'
    ),
    numbered AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) + (SELECT val FROM start_from) AS seq
      FROM "FactCheck"
      WHERE "publicId" IS NULL
    )
    UPDATE "FactCheck" t
    SET "publicId" = 'FC-' || LPAD(n.seq::text, 6, '0')
    FROM numbered n
    WHERE t.id = n.id
  `;
  const max = await currentMax("FactCheck", "FC");
  if (max > 0) {
    await db.$executeRaw`SELECT setval('poligraph_factcheck_seq', ${max})`;
  }
  console.log(`  FactCheck: ${updated} backfilled, max FC-${pad(max)}`);
}

async function backfillScrutin() {
  const updated = await db.$executeRaw`
    WITH start_from AS (
      SELECT COALESCE(MAX(CAST(SUBSTRING("publicId" FROM '[0-9]+') AS BIGINT)), 0) AS val
      FROM "Scrutin"
      WHERE "publicId" LIKE 'SC-%'
    ),
    numbered AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) + (SELECT val FROM start_from) AS seq
      FROM "Scrutin"
      WHERE "publicId" IS NULL
    )
    UPDATE "Scrutin" t
    SET "publicId" = 'SC-' || LPAD(n.seq::text, 6, '0')
    FROM numbered n
    WHERE t.id = n.id
  `;
  const max = await currentMax("Scrutin", "SC");
  if (max > 0) {
    await db.$executeRaw`SELECT setval('poligraph_scrutin_seq', ${max})`;
  }
  console.log(`  Scrutin: ${updated} backfilled, max SC-${pad(max)}`);
}

async function backfillParty() {
  const updated = await db.$executeRaw`
    WITH start_from AS (
      SELECT COALESCE(MAX(CAST(SUBSTRING("publicId" FROM '[0-9]+') AS BIGINT)), 0) AS val
      FROM "Party"
      WHERE "publicId" LIKE 'PT-%'
    ),
    numbered AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) + (SELECT val FROM start_from) AS seq
      FROM "Party"
      WHERE "publicId" IS NULL
    )
    UPDATE "Party" t
    SET "publicId" = 'PT-' || LPAD(n.seq::text, 6, '0')
    FROM numbered n
    WHERE t.id = n.id
  `;
  const max = await currentMax("Party", "PT");
  if (max > 0) {
    await db.$executeRaw`SELECT setval('poligraph_party_seq', ${max})`;
  }
  console.log(`  Party: ${updated} backfilled, max PT-${pad(max)}`);
}

async function backfillElection() {
  const updated = await db.$executeRaw`
    WITH start_from AS (
      SELECT COALESCE(MAX(CAST(SUBSTRING("publicId" FROM '[0-9]+') AS BIGINT)), 0) AS val
      FROM "Election"
      WHERE "publicId" LIKE 'EL-%'
    ),
    numbered AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) + (SELECT val FROM start_from) AS seq
      FROM "Election"
      WHERE "publicId" IS NULL
    )
    UPDATE "Election" t
    SET "publicId" = 'EL-' || LPAD(n.seq::text, 6, '0')
    FROM numbered n
    WHERE t.id = n.id
  `;
  const max = await currentMax("Election", "EL");
  if (max > 0) {
    await db.$executeRaw`SELECT setval('poligraph_election_seq', ${max})`;
  }
  console.log(`  Election: ${updated} backfilled, max EL-${pad(max)}`);
}

async function backfillMandate() {
  const updated = await db.$executeRaw`
    WITH start_from AS (
      SELECT COALESCE(MAX(CAST(SUBSTRING("publicId" FROM '[0-9]+') AS BIGINT)), 0) AS val
      FROM "Mandate"
      WHERE "publicId" LIKE 'MA-%'
    ),
    numbered AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) + (SELECT val FROM start_from) AS seq
      FROM "Mandate"
      WHERE "publicId" IS NULL
    )
    UPDATE "Mandate" t
    SET "publicId" = 'MA-' || LPAD(n.seq::text, 6, '0')
    FROM numbered n
    WHERE t.id = n.id
  `;
  const max = await currentMax("Mandate", "MA");
  if (max > 0) {
    await db.$executeRaw`SELECT setval('poligraph_mandate_seq', ${max})`;
  }
  console.log(`  Mandate: ${updated} backfilled, max MA-${pad(max)}`);
}

async function backfillLegislativeDossier() {
  const updated = await db.$executeRaw`
    WITH start_from AS (
      SELECT COALESCE(MAX(CAST(SUBSTRING("publicId" FROM '[0-9]+') AS BIGINT)), 0) AS val
      FROM "LegislativeDossier"
      WHERE "publicId" LIKE 'DO-%'
    ),
    numbered AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) + (SELECT val FROM start_from) AS seq
      FROM "LegislativeDossier"
      WHERE "publicId" IS NULL
    )
    UPDATE "LegislativeDossier" t
    SET "publicId" = 'DO-' || LPAD(n.seq::text, 6, '0')
    FROM numbered n
    WHERE t.id = n.id
  `;
  const max = await currentMax("LegislativeDossier", "DO");
  if (max > 0) {
    await db.$executeRaw`SELECT setval('poligraph_dossier_seq', ${max})`;
  }
  console.log(`  LegislativeDossier: ${updated} backfilled, max DO-${pad(max)}`);
}

async function backfillParliamentaryGroup() {
  const updated = await db.$executeRaw`
    WITH start_from AS (
      SELECT COALESCE(MAX(CAST(SUBSTRING("publicId" FROM '[0-9]+') AS BIGINT)), 0) AS val
      FROM "ParliamentaryGroup"
      WHERE "publicId" LIKE 'GP-%'
    ),
    numbered AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) + (SELECT val FROM start_from) AS seq
      FROM "ParliamentaryGroup"
      WHERE "publicId" IS NULL
    )
    UPDATE "ParliamentaryGroup" t
    SET "publicId" = 'GP-' || LPAD(n.seq::text, 6, '0')
    FROM numbered n
    WHERE t.id = n.id
  `;
  const max = await currentMax("ParliamentaryGroup", "GP");
  if (max > 0) {
    await db.$executeRaw`SELECT setval('poligraph_group_seq', ${max})`;
  }
  console.log(`  ParliamentaryGroup: ${updated} backfilled, max GP-${pad(max)}`);
}

async function backfillElectoralList() {
  const updated = await db.$executeRaw`
    WITH start_from AS (
      SELECT COALESCE(MAX(CAST(SUBSTRING("publicId" FROM '[0-9]+') AS BIGINT)), 0) AS val
      FROM "ElectoralList"
      WHERE "publicId" LIKE 'LM-%'
    ),
    numbered AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) + (SELECT val FROM start_from) AS seq
      FROM "ElectoralList"
      WHERE "publicId" IS NULL
    )
    UPDATE "ElectoralList" t
    SET "publicId" = 'LM-' || LPAD(n.seq::text, 6, '0')
    FROM numbered n
    WHERE t.id = n.id
  `;
  const max = await currentMax("ElectoralList", "LM");
  if (max > 0) {
    await db.$executeRaw`SELECT setval('poligraph_electoral_list_seq', ${max})`;
  }
  console.log(`  ElectoralList: ${updated} backfilled, max LM-${pad(max)}`);
}

/**
 * Fetch the maximum sequence number currently assigned for a given entity.
 * Separate queries per table because Prisma template literals can't
 * parameterize identifiers.
 */
async function currentMax(table: string, prefix: string): Promise<number> {
  let rows: { max: string | null }[];
  switch (`${table}:${prefix}`) {
    case "Politician:PG":
      rows = await db.$queryRaw<{ max: string | null }[]>`
        SELECT MAX(CAST(SUBSTRING("publicId" FROM '[0-9]+') AS BIGINT))::text AS max
        FROM "Politician" WHERE "publicId" LIKE 'PG-%'
      `;
      break;
    case "Affair:AF":
      rows = await db.$queryRaw<{ max: string | null }[]>`
        SELECT MAX(CAST(SUBSTRING("publicId" FROM '[0-9]+') AS BIGINT))::text AS max
        FROM "Affair" WHERE "publicId" LIKE 'AF-%'
      `;
      break;
    case "FactCheck:FC":
      rows = await db.$queryRaw<{ max: string | null }[]>`
        SELECT MAX(CAST(SUBSTRING("publicId" FROM '[0-9]+') AS BIGINT))::text AS max
        FROM "FactCheck" WHERE "publicId" LIKE 'FC-%'
      `;
      break;
    case "Scrutin:SC":
      rows = await db.$queryRaw<{ max: string | null }[]>`
        SELECT MAX(CAST(SUBSTRING("publicId" FROM '[0-9]+') AS BIGINT))::text AS max
        FROM "Scrutin" WHERE "publicId" LIKE 'SC-%'
      `;
      break;
    case "Party:PT":
      rows = await db.$queryRaw<{ max: string | null }[]>`
        SELECT MAX(CAST(SUBSTRING("publicId" FROM '[0-9]+') AS BIGINT))::text AS max
        FROM "Party" WHERE "publicId" LIKE 'PT-%'
      `;
      break;
    case "Election:EL":
      rows = await db.$queryRaw<{ max: string | null }[]>`
        SELECT MAX(CAST(SUBSTRING("publicId" FROM '[0-9]+') AS BIGINT))::text AS max
        FROM "Election" WHERE "publicId" LIKE 'EL-%'
      `;
      break;
    case "Mandate:MA":
      rows = await db.$queryRaw<{ max: string | null }[]>`
        SELECT MAX(CAST(SUBSTRING("publicId" FROM '[0-9]+') AS BIGINT))::text AS max
        FROM "Mandate" WHERE "publicId" LIKE 'MA-%'
      `;
      break;
    case "LegislativeDossier:DO":
      rows = await db.$queryRaw<{ max: string | null }[]>`
        SELECT MAX(CAST(SUBSTRING("publicId" FROM '[0-9]+') AS BIGINT))::text AS max
        FROM "LegislativeDossier" WHERE "publicId" LIKE 'DO-%'
      `;
      break;
    case "ParliamentaryGroup:GP":
      rows = await db.$queryRaw<{ max: string | null }[]>`
        SELECT MAX(CAST(SUBSTRING("publicId" FROM '[0-9]+') AS BIGINT))::text AS max
        FROM "ParliamentaryGroup" WHERE "publicId" LIKE 'GP-%'
      `;
      break;
    case "ElectoralList:LM":
      rows = await db.$queryRaw<{ max: string | null }[]>`
        SELECT MAX(CAST(SUBSTRING("publicId" FROM '[0-9]+') AS BIGINT))::text AS max
        FROM "ElectoralList" WHERE "publicId" LIKE 'LM-%'
      `;
      break;
    default:
      throw new Error(`Unknown table/prefix combo: ${table}:${prefix}`);
  }
  return rows[0]?.max ? parseInt(rows[0].max, 10) : 0;
}

function pad(n: number): string {
  return String(n).padStart(6, "0");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
