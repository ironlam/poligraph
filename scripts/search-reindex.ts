#!/usr/bin/env tsx
/**
 * npm run search:reindex
 *
 * Rebuilds the search documents of every measure from its pointers. Idempotent: it calls the same
 * derivation the transitions call, so a second run changes nothing.
 */
import { db } from "@/lib/db";
import { reindexMeasures } from "@/lib/search/maintenance";

async function main(): Promise<void> {
  const result = await reindexMeasures();
  console.log(`[search:reindex] ${result.processed} mesure(s) réindexée(s)`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
