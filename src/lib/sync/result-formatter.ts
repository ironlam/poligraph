/**
 * Result formatting utilities for sync scripts
 *
 * Provides consistent output formatting across all sync scripts.
 */

import type { SyncResult } from "./types";

const SEPARATOR = "=".repeat(50);

/**
 * Format and display sync results
 */
export function formatResults(
  result: SyncResult,
  options?: {
    showDuration?: boolean;
    maxErrors?: number;
  }
): void {
  const { showDuration = true, maxErrors = 10 } = options ?? {};

  console.log("\n" + SEPARATOR);
  console.log("Sync Results:");
  console.log(SEPARATOR);

  if (showDuration) {
    console.log(`Duration: ${result.duration.toFixed(2)}s`);
  }

  // Display all stats
  for (const [key, value] of Object.entries(result.stats)) {
    const label = formatStatLabel(key);
    console.log(`${label}: ${value}`);
  }

  // Display errors if any
  if (result.errors.length > 0) {
    console.log(`\nErrors (${result.errors.length}):`);
    result.errors.slice(0, maxErrors).forEach((e) => console.log(`  - ${e}`));
    if (result.errors.length > maxErrors) {
      console.log(`  ... and ${result.errors.length - maxErrors} more`);
    }
  }

  console.log("\n" + SEPARATOR);
}

/**
 * Display script header
 */
export function formatHeader(
  name: string,
  options?: {
    mode?: string;
    limit?: number;
    extra?: Record<string, string>;
  }
): void {
  const { mode, limit, extra } = options ?? {};

  console.log(SEPARATOR);
  console.log(name);
  console.log(SEPARATOR);

  if (mode) {
    console.log(`Mode: ${mode}`);
  }

  if (limit) {
    console.log(`Limit: ${limit}`);
  }

  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      console.log(`${key}: ${value}`);
    }
  }

  console.log(`Started at: ${new Date().toISOString()}\n`);
}

/**
 * Convert camelCase stat key to readable label
 */
function formatStatLabel(key: string): string {
  // Common mappings
  const mappings: Record<string, string> = {
    processed: "Processed",
    created: "Created",
    updated: "Updated",
    skipped: "Skipped",
    deleted: "Deleted",
    birthDatesAdded: "Birth dates added",
    deathDatesAdded: "Death dates added",
    noDateInWikidata: "No date in Wikidata",
    politiciansProcessed: "Politicians processed",
    mandatesCreated: "Mandates created",
    mandatesSkipped: "Mandates skipped",
    alreadyHadDate: "Already had date",
  };

  if (mappings[key]) {
    return mappings[key];
  }

  // Convert camelCase to Title Case with spaces
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}
