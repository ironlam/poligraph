#!/usr/bin/env tsx
/**
 * Seeds a fictional demo corpus for the presidential 2027 hub, so the public routes
 * /elections/presidentielle-2027, /elections/presidentielle-2027/sujets and
 * /elections/presidentielle-2027/sujets/numerique-tech can be reviewed in a browser
 * (responsive + axe).
 *
 * The seeding itself lives in src/lib/data/__tests__/presidentielle-hub-demo.ts (a test fixture,
 * where writing PUBLISHED directly is allowed); this script is the thin, guarded entry point.
 *
 * Refuses to run against anything but the disposable container, and that refusal is the point:
 * `.env` and `.env.prod` point at the same Supabase database.
 *
 * Expects a fresh database: this and scripts/seed-presidentielle-sujet-demo.ts both create the
 * `presidentielle-2027` election, so running one after the other on the same container fails on
 * the slug's unique constraint.
 *
 * Usage, with the container from docker-compose.test-search.yml running and its schema pushed:
 *   DATABASE_URL=postgresql://poligraph_test:poligraph_test@localhost:55433/poligraph_test?sslmode=disable \
 *     npx tsx scripts/seed-presidentielle-hub-demo.ts
 */
import { assertDisposableTestDb } from "@/test/disposable-db";

async function main(): Promise<void> {
  // First statement, before any import that opens a connection: the guard is the safety net.
  assertDisposableTestDb();

  const { seedPresidentielleHubDemo } =
    await import("@/lib/data/__tests__/presidentielle-hub-demo");
  const { db } = await import("@/lib/db");

  const { electionId } = await seedPresidentielleHubDemo(db);
  console.log(`[seed:presidentielle-hub] élection presidentielle-2027 (${electionId})`);
  console.log(
    "[seed:presidentielle-hub] champ : 2 candidatures sourcées sans extension, 2 fiches " +
      "publiées avec mesure Logement, 1 fiche publiée avec mesure Numérique (sous le seuil)"
  );

  await db.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
