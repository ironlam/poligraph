/**
 * CLI script to sync senators from senat.fr
 *
 * Usage:
 *   npm run sync:senat              # Full sync
 *   npm run sync:senat -- --stats   # Show current stats
 */

import "dotenv/config";
import { createCLI, type SyncHandler, type SyncResult } from "../src/lib/sync";
import { syncSenateurs, getSenatStats, getSyncStats } from "../src/services/sync";

const handler: SyncHandler = {
  name: "Politic Tracker - Senators Sync",
  description: "Import senators from senat.fr",

  showHelp() {
    console.log(`
Politic Tracker - Senators Sync

Data sources:
  - Primary: senat.fr API (official Senate data)
  - Secondary: archive.nossenateurs.fr (birth dates, historical data)
    `);
  },

  async showStats() {
    const [senatStats, globalStats] = await Promise.all([getSenatStats(), getSyncStats()]);

    console.log("\n" + "=".repeat(50));
    console.log("Senate Stats");
    console.log("=".repeat(50));
    console.log(`Total politicians: ${globalStats.politicians}`);
    console.log(`Total parties: ${globalStats.parties}`);
    console.log(`Current mandates: ${globalStats.currentMandates}`);
    console.log(`\nSenators with current mandate: ${senatStats.senators}`);
    console.log(`Current senator mandates: ${senatStats.currentMandates}`);
  },

  async sync(options): Promise<SyncResult> {
    const { dryRun = false } = options;

    if (dryRun) {
      console.log("[DRY-RUN] Would sync senators from senat.fr");
      return { success: true, duration: 0, stats: {}, errors: [] };
    }

    const result = await syncSenateurs();

    return {
      success: result.success,
      duration: 0,
      stats: {
        groupsCreated: result.groupsCreated,
        groupsUpdated: result.groupsUpdated,
        senatorsCreated: result.senatorsCreated,
        senatorsUpdated: result.senatorsUpdated,
        groupPresidenciesWritten: result.groupPresidenciesWritten,
      },
      errors: result.errors,
    };
  },
};

createCLI(handler);
