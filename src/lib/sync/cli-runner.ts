/**
 * Unified CLI Runner for sync scripts
 *
 * Provides consistent argument parsing, help display, and execution flow
 * for all sync scripts.
 *
 * Usage:
 * ```typescript
 * import { createCLI } from "@/lib/sync/cli-runner";
 *
 * const handler: SyncHandler = {
 *   name: "My Sync",
 *   description: "Syncs data from source",
 *   showHelp() { ... },
 *   showStats() { ... },
 *   sync(options) { ... },
 * };
 *
 * createCLI(handler);
 * ```
 */

import { db } from "../db";
import { parseCLIOptions } from "../cli/parse-options";
import { formatHeader, formatResults } from "./result-formatter";
import type { CLIOptionDefinition, SyncHandler, SyncOptions, SyncResult } from "./types";

/**
 * Standard CLI options available to all sync scripts
 */
const STANDARD_OPTIONS: CLIOptionDefinition[] = [
  { name: "--help", alias: "-h", type: "boolean", description: "Show help" },
  { name: "--stats", type: "boolean", description: "Show current statistics" },
  { name: "--dry-run", type: "boolean", description: "Preview without saving" },
  {
    name: "--force",
    alias: "-f",
    type: "boolean",
    description: "Force full sync (bypass incremental)",
  },
  { name: "--limit", alias: "-l", type: "number", description: "Limit items to process" },
  { name: "--verbose", alias: "-v", type: "boolean", description: "Verbose output" },
];

/**
 * Parse command line arguments
 */
function parseArgs(args: string[], customOptions?: SyncHandler["options"]): SyncOptions {
  const allOptions = [...STANDARD_OPTIONS, ...(customOptions ?? [])];
  return parseCLIOptions(args, allOptions) as SyncOptions;
}

/**
 * Display formatted help with standard and custom options
 */
function showFormattedHelp(handler: SyncHandler): void {
  // Let the handler show its custom help first
  handler.showHelp();

  // Show standard options
  console.log("\nStandard options:");
  for (const opt of STANDARD_OPTIONS) {
    const alias = opt.alias ? `, ${opt.alias}` : "";
    console.log(`  ${opt.name}${alias}`.padEnd(20) + opt.description);
  }

  // Show custom options if any
  if (handler.options && handler.options.length > 0) {
    console.log("\nScript-specific options:");
    for (const opt of handler.options) {
      const alias = opt.alias ? `, ${opt.alias}` : "";
      const def = opt.default !== undefined ? ` (default: ${opt.default})` : "";
      console.log(`  ${opt.name}${alias}`.padEnd(20) + opt.description + def);
    }
  }

  console.log("");
}

/**
 * Create and run CLI for a sync handler
 */
export function createCLI(handler: SyncHandler): void {
  const args = process.argv.slice(2);
  const options = parseArgs(args, handler.options);

  // Main execution wrapped in async IIFE
  (async () => {
    // Handle --help
    if (options.help || options.h) {
      showFormattedHelp(handler);
      process.exit(0);
    }

    // Handle --stats
    if (options.stats) {
      await handler.showStats();
      process.exit(0);
    }

    // Run sync
    const mode = options.dryRun ? "DRY RUN (no changes)" : "LIVE";
    formatHeader(handler.name, {
      mode,
      limit: options.limit as number | undefined,
    });

    const startTime = Date.now();

    try {
      const result = await handler.sync(options);

      // Calculate duration if not set
      if (result.duration === 0) {
        result.duration = (Date.now() - startTime) / 1000;
      }

      formatResults(result);

      if (!result.success) {
        process.exit(1);
      }
    } catch (error) {
      console.error("\nFatal error:", error);

      // Create error result
      const errorResult: SyncResult = {
        success: false,
        duration: (Date.now() - startTime) / 1000,
        stats: {},
        errors: [String(error)],
      };

      formatResults(errorResult);
      process.exit(1);
    }
  })()
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    })
    .finally(async () => {
      await db.$disconnect();
      process.exit(0);
    });
}

// Re-export types for convenience
export type { SyncHandler, SyncOptions, SyncResult, CLIOptionDefinition } from "./types";
