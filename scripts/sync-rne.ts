/**
 * CLI script to sync RNE (Répertoire National des Élus) maires
 *
 * Usage:
 * Writes are suspended until mayor identity matching is corrected.
 *   npm run sync:rne:maires              # Fails with RNE_WRITES_SUSPENDED
 *   npm run sync:rne:maires -- --stats   # Show current stats
 *   npm run sync:rne:maires -- --dry-run # Preview without saving
 *   npm run sync:rne:maires -- --dry-run --limit=100 --verbose # Parse 100 rows
 *   npm run sync:rne:maires -- --resolve-parties # Suspended, including with --dry-run
 */

import "dotenv/config";
import { createCLI, type SyncHandler, type SyncResult } from "../src/lib/sync";
import { syncRNEMaires, getRNEStats, resolveParties } from "../src/services/sync/rne";

const handler: SyncHandler = {
  name: "Politic Tracker - RNE Maires Sync",
  description: "Import maires from Répertoire National des Élus (data.gouv.fr)",

  options: [
    {
      name: "--resolve-parties",
      type: "boolean",
      description: "Suspended: party resolution requires verified mayor identities",
    },
  ],

  showHelp() {
    console.log(`
Politic Tracker - RNE Maires Sync

Data source: Répertoire National des Élus (data.gouv.fr)
Imports: Maires de France (~35 000)
Matching: Associates RNE data with existing politicians in our database
Writes suspended: use --stats or --dry-run. Party resolution is unavailable.
    `);
  },

  async showStats() {
    const stats = await getRNEStats();

    console.log("\n" + "=".repeat(50));
    console.log("RNE Maires Stats:");
    console.log("=".repeat(50));
    console.log(`  Total maires: ${stats.totalMaires}`);
    console.log(`  Currently active: ${stats.totalCurrent}`);
    console.log(`  With national presence: ${stats.totalWithNationalPresence}`);
  },

  async sync(options): Promise<SyncResult> {
    const { dryRun = false, limit, verbose = false } = options;

    // --resolve-parties: standalone mode, skip main sync
    if (options.resolveParties) {
      console.log("\n--- Resolve party affiliations ---");
      const result = await resolveParties({ verbose: verbose as boolean });
      return {
        success: true,
        duration: 0,
        stats: {
          partiesFromNuance: result.fromNuance,
          partiesFromPolitician: result.fromPolitician,
          unmappedNuances: result.unmapped.length,
        },
        errors: [],
      };
    }

    const result = await syncRNEMaires({
      dryRun,
      limit: limit as number | undefined,
      verbose: verbose as boolean,
    });

    return {
      success: result.success,
      duration: 0,
      stats: {
        officialsCreated: result.officialsCreated,
        officialsUpdated: result.officialsUpdated,
        officialsClosed: result.officialsClosed,
        mandatesCreated: result.mandatesCreated,
        mandatesUpdated: result.mandatesUpdated,
        mandatesClosed: result.mandatesClosed,
        politiciansMatched: result.politiciansMatched,
      },
      errors: result.errors,
    };
  },
};

createCLI(handler);
