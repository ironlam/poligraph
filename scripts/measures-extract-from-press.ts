#!/usr/bin/env tsx
/**
 * npm run measures:extract-press -- --election <id> [--limit=10] [--dry-run]
 *
 * Extracts campaign measures from press articles. Replaces the promise-extraction sample: the pipeline
 * now writes a measure, its first revision and its source, all in draft.
 *
 * The election is required: a measure belongs to a campaign, and an article about a politician does not
 * say which one.
 */
import { db } from "@/lib/db";
import { ingestMeasuresFromPress } from "@/services/measures/press-ingest";

async function main(): Promise<void> {
  const electionIndex = process.argv.indexOf("--election");
  const electionId = electionIndex === -1 ? undefined : process.argv[electionIndex + 1];
  if (electionId === undefined) {
    console.error("Usage : --election <id> [--limit=10] [--dry-run]");
    process.exitCode = 1;
    return;
  }

  const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 10);
  const dryRun = process.argv.includes("--dry-run");

  console.log(
    `[measures:extract-press] élection ${electionId}, limite ${limit}, ${dryRun ? "essai à blanc" : "écriture"}`
  );
  const result = await ingestMeasuresFromPress({ electionId, limit, dryRun });
  console.log(`  articles lus            ${result.scanned}`);
  console.log(`  extraits                ${result.extracted}`);
  console.log(`  mesures créées          ${result.created}`);
  console.log(`  mentions non candidates ${result.skippedNotCandidate}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
