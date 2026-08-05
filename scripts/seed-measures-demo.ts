#!/usr/bin/env tsx
/**
 * npm run seed:measures-demo
 *
 * Seeds the demonstration corpus so the moderation screens can be reviewed against every
 * state they claim to render. No measure exists in production, so there is nothing else to
 * look at.
 *
 * Refuses to run against anything but the disposable container, and that refusal is the
 * point: `.env` and `.env.prod` point at the same Supabase database, so an ungated run with
 * the default environment would write fabricated political positions into production.
 *
 * Usage, with the container from docker-compose.test-search.yml running:
 *   DATABASE_URL=postgresql://poligraph_test:poligraph_test@localhost:55433/poligraph_test?sslmode=disable \
 *     npx tsx scripts/seed-measures-demo.ts
 */
import { assertDisposableTestDb } from "@/test/disposable-db";
import { seedMeasuresDemoCorpus } from "@/test/fixtures/measures-demo";

async function main(): Promise<void> {
  // First statement of the script, before any import that opens a connection.
  assertDisposableTestDb();

  const corpus = await seedMeasuresDemoCorpus();
  const { db } = await import("@/lib/db");

  console.log(`[seed:measures-demo] élection ${corpus.electionSlug} (${corpus.electionId})`);
  for (const [key, id] of Object.entries(corpus.measureIds)) {
    console.log(`  ${key.padEnd(24)} ${id}`);
  }
  console.log(
    `[seed:measures-demo] ${Object.keys(corpus.measureIds).length} mesures, ` +
      `${corpus.candidateIds.length} candidatures fictives`
  );

  await db.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
