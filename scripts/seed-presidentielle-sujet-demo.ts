#!/usr/bin/env tsx
/**
 * Seeds a fictional, publishable subject page for the presidential 2027 hub, so the public route
 * /presidentielle-2027/sujets/logement-urbanisme can be reviewed in a browser (responsive + axe).
 *
 * The seeding itself lives in src/lib/data/__tests__/presidentielle-subject-demo.ts (a test fixture,
 * where writing PUBLISHED directly is allowed); this script is the thin, guarded entry point.
 *
 * Refuses to run against anything but the disposable container, and that refusal is the point:
 * `.env` and `.env.prod` point at the same Supabase database.
 *
 * Usage, with the container from docker-compose.test-search.yml running and its schema pushed:
 *   DATABASE_URL=postgresql://poligraph_test:poligraph_test@localhost:55433/poligraph_test?sslmode=disable \
 *     npx tsx scripts/seed-presidentielle-sujet-demo.ts
 */
import { assertDisposableTestDb } from "@/test/disposable-db";

async function main(): Promise<void> {
  // First statement, before any import that opens a connection: the guard is the safety net.
  assertDisposableTestDb();

  const { seedPresidentielleSubjectDemo } =
    await import("@/lib/data/__tests__/presidentielle-subject-demo");
  const { db } = await import("@/lib/db");

  const { electionId } = await seedPresidentielleSubjectDemo();
  console.log(`[seed:presidentielle-sujet] élection presidentielle-2027 (${electionId})`);
  console.log(
    "[seed:presidentielle-sujet] 3 candidatures publiées, 2 avec mesure sur LOGEMENT_URBANISME"
  );

  await db.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
