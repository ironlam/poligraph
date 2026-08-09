/**
 * Seed script for French communes from geo.api.gouv.fr
 *
 * Imports ~35K communes into the Commune table with INSEE code, name,
 * department/region info, postal codes, population, coordinates, and
 * computed municipal council seat counts.
 *
 * Idempotent: uses upsert on INSEE code, safe to run multiple times.
 *
 * Usage:
 *   npx dotenv -e .env -- npx tsx scripts/seed-communes.ts
 */

import { PrismaClient } from "@/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { COMMUNE_DATA_SYNC_KEY, COMMUNE_POPULATION_SOURCE } from "@/config/communes";

// --- Dedicated pool for bulk operations (more generous than serverless default) ---

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 15_000,
  connectionTimeoutMillis: 15_000,
  ssl: { rejectUnauthorized: false },
  allowExitOnIdle: true,
  statement_timeout: 60_000,
});

const db = new PrismaClient({ adapter: new PrismaPg(pool) });

// --- Types ---

interface GeoAPICommune {
  code: string; // INSEE code
  nom: string;
  codeDepartement: string;
  nomDepartement?: string;
  codeRegion?: string;
  nomRegion?: string;
  codesPostaux?: string[];
  population?: number;
  centre?: {
    type: "Point";
    coordinates: [number, number]; // [longitude, latitude]
  };
}

// --- Seat computation (Article L2121-2 CGCT) ---

function computeTotalSeats(population: number | undefined): number | null {
  if (population == null) return null;

  if (population < 100) return 7;
  if (population < 500) return 11;
  if (population < 1500) return 15;
  if (population < 2500) return 19;
  if (population < 3500) return 23;
  if (population < 5000) return 27;
  if (population < 10000) return 29;
  if (population < 20000) return 33;
  if (population < 30000) return 35;
  if (population < 40000) return 39;
  if (population < 50000) return 43;
  if (population < 60000) return 45;
  if (population < 80000) return 49;
  if (population < 100000) return 53;
  if (population < 150000) return 55;
  if (population < 200000) return 59;
  if (population < 250000) return 61;
  if (population < 300000) return 65;
  return 69;
}

// --- Fetch communes from API ---

async function fetchCommunes(): Promise<GeoAPICommune[]> {
  const url =
    "https://geo.api.gouv.fr/communes?fields=code,nom,codeDepartement,nomDepartement,codeRegion,nomRegion,codesPostaux,population,centre&limit=100000";

  console.log("Fetching communes from geo.api.gouv.fr...");
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  const data: GeoAPICommune[] = await response.json();
  console.log(`Received ${data.length} communes from API\n`);
  return data;
}

// --- Main ---

async function main() {
  console.log("=== Seed communes from geo.api.gouv.fr ===\n");

  // Count existing communes to estimate created vs updated at the end
  const countBefore = await db.commune.count();
  console.log(`Communes currently in DB: ${countBefore}\n`);

  const communes = await fetchCommunes();

  const BATCH_SIZE = 200;
  let upserted = 0;
  let errors = 0;

  for (let i = 0; i < communes.length; i += BATCH_SIZE) {
    const batch = communes.slice(i, i + BATCH_SIZE);

    // Process each batch with Promise.all — Prisma queues queries internally
    // against the pool (max: 10). Batch size of 200 keeps it manageable.
    const results = await Promise.all(
      batch.map(async (commune) => {
        try {
          const data = {
            name: commune.nom,
            departmentCode: commune.codeDepartement,
            departmentName: commune.nomDepartement ?? commune.codeDepartement,
            regionCode: commune.codeRegion ?? null,
            regionName: commune.nomRegion ?? null,
            postalCodes: commune.codesPostaux ?? [],
            population: commune.population ?? null,
            latitude: commune.centre?.coordinates[1] ?? null,
            longitude: commune.centre?.coordinates[0] ?? null,
            totalSeats: computeTotalSeats(commune.population),
          };

          await db.commune.upsert({
            where: { id: commune.code },
            create: { id: commune.code, ...data },
            update: data,
          });

          return true;
        } catch (err) {
          console.error(`  Error upserting commune ${commune.code} (${commune.nom}):`, err);
          return false;
        }
      })
    );

    for (const success of results) {
      if (success) upserted++;
      else errors++;
    }

    // Progress report every 5000 communes
    const processed = Math.min(i + BATCH_SIZE, communes.length);
    if (processed % 5000 < BATCH_SIZE || processed === communes.length) {
      console.log(
        `  Progress: ${processed}/${communes.length} (${upserted} upserted, ${errors} errors)`
      );
    }
  }

  // Record when we asked geo.api.gouv.fr, since the API publishes no population
  // vintage. Surfaces that render a population date the import, not a vintage
  // they cannot verify. See src/config/communes.ts.
  await db.syncMetadata.upsert({
    where: { sourceKey: COMMUNE_DATA_SYNC_KEY },
    create: {
      sourceKey: COMMUNE_DATA_SYNC_KEY,
      lastSyncAt: new Date(),
      itemCount: upserted,
      extra: { source: COMMUNE_POPULATION_SOURCE.via, url: COMMUNE_POPULATION_SOURCE.url },
    },
    update: {
      lastSyncAt: new Date(),
      itemCount: upserted,
      extra: { source: COMMUNE_POPULATION_SOURCE.via, url: COMMUNE_POPULATION_SOURCE.url },
    },
  });

  // Final report
  const countAfter = await db.commune.count();
  const newlyCreated = countAfter - countBefore;

  console.log("\n=== Done ===");
  console.log(`  API communes: ${communes.length}`);
  console.log(`  Upserted: ${upserted}`);
  console.log(`  New: ~${newlyCreated}`);
  console.log(`  Updated: ~${upserted - newlyCreated}`);
  if (errors > 0) {
    console.log(`  Errors: ${errors}`);
  }
  console.log(`  Communes in DB: ${countAfter}`);
}

main()
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
    await pool.end();
  });
