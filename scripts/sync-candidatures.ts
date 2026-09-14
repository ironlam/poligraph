/**
 * CLI script to sync candidatures municipales from data.gouv.fr
 *
 * Usage:
 *   npm run sync:elections:municipales              # Full sync (default URL)
 *   npm run sync:elections:municipales -- --stats   # Show current stats
 *   npm run sync:elections:municipales -- --dry-run # Preview without saving
 *   npm run sync:elections:municipales -- --limit=100 --verbose
 *   npm run sync:elections:municipales -- --url="https://..." --election=municipales-2026
 */

import "dotenv/config";
import { createCLI, type SyncHandler, type SyncResult } from "../src/lib/sync";
import {
  syncCandidaturesMunicipales,
  getCandidaturesStats,
} from "../src/services/sync/candidatures";

const handler: SyncHandler = {
  name: "Politic Tracker - Candidatures Municipales Sync",
  description: "Import candidatures from data.gouv.fr (municipales 2026, tour 1)",

  options: [
    {
      name: "--url",
      type: "string",
      description: "URL of the candidatures CSV file (default: stable 2026 round-1 resource)",
    },
    {
      name: "--election",
      type: "string",
      description: "Election slug to import into",
      default: "municipales-2026",
    },
  ],

  showHelp() {
    console.log(`
Politic Tracker - Candidatures Municipales Sync

Data source: data.gouv.fr (élections municipales)
Format: Semicolon-delimited CSV, UTF-8, with column header
Imports: Candidate lists and individual candidates

Default URL follows the stable data.gouv resource for the 2026 national round-1 CSV.
Use --url to override the source with a CSV using the same columns and encoding.

Examples:
  npm run sync:elections:municipales -- --dry-run --limit=100 --verbose
  npm run sync:elections:municipales -- --url="https://..." --election=municipales-2026
    `);
  },

  async showStats() {
    const stats = await getCandidaturesStats();

    console.log("\n" + "=".repeat(50));
    console.log("Candidatures Municipales Stats");
    console.log("=".repeat(50));
    console.log(`Total candidacies: ${stats.totalCandidacies}`);
    console.log(`Matched to politicians: ${stats.matchedCandidacies}`);

    if (stats.byElection.length > 0) {
      console.log("\nBy election:");
      for (const entry of stats.byElection) {
        const e = entry.election;
        console.log(
          `  ${e?.title ?? "Unknown"} (${e?.slug}): ${entry.count} candidacies [${e?.status}]`
        );
      }
    }
  },

  async sync(options): Promise<SyncResult> {
    const { dryRun = false, limit, verbose = false, url, election } = options;

    const result = await syncCandidaturesMunicipales({
      url: url as string | undefined,
      election: election as string | undefined,
      dryRun,
      limit: limit as number | undefined,
      verbose: verbose as boolean,
    });

    return {
      success: result.success,
      duration: 0,
      stats: {
        candidaciesCreated: result.candidaciesCreated,
        candidaciesUpdated: result.candidaciesUpdated,
        politiciansMatched: result.politiciansMatched,
        politiciansNotFound: result.politiciansNotFound,
      },
      errors: result.errors,
    };
  },
};

createCLI(handler);
