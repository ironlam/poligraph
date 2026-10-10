/**
 * CLI script to sync government members from data.gouv.fr
 *
 * Usage:
 *   npm run sync:gouvernement              # Sync current government only
 *   npm run sync:gouvernement -- --all     # Sync all historical governments
 *   npm run sync:gouvernement -- --stats   # Show current stats
 *   npm run sync:gouvernement -- --dry-run # Imprime le plan sans rien écrire (permis pendant le gel)
 */

import "dotenv/config";
import { createCLI, type SyncHandler, type SyncResult } from "../src/lib/sync";
import { syncGouvernement, getGouvernementStats, getSyncStats } from "../src/services/sync";

const handler: SyncHandler = {
  name: "Politic Tracker - Government Sync",
  description: "Import government members from data.gouv.fr",

  options: [
    {
      name: "--all",
      type: "boolean",
      description: "Sync all historical governments (Ve République)",
    },
    {
      name: "--allow-during-government-migration",
      type: "boolean",
      description: "Lever le gel du sync gouvernement pendant la migration",
    },
  ],

  showHelp() {
    console.log(`
Politic Tracker - Government Sync

Data source: data.gouv.fr - Historique des Gouvernements de la Ve République
    `);
  },

  async showStats() {
    const [govStats, globalStats] = await Promise.all([getGouvernementStats(), getSyncStats()]);

    console.log("\n" + "=".repeat(50));
    console.log("Government Stats");
    console.log("=".repeat(50));
    console.log(`Total politicians: ${globalStats.politicians}`);
    console.log(`Total parties: ${globalStats.parties}`);
    console.log(`Current mandates: ${globalStats.currentMandates}`);
    console.log(`\nCurrent government members: ${govStats.currentGovernmentMembers}`);
    console.log(`Total government mandates: ${govStats.totalGovernmentMandates}`);
  },

  async sync(options): Promise<SyncResult> {
    const { dryRun = false, all = false, allowDuringGovernmentMigration = false } = options;

    console.log(`Mode: ${all ? "All historical governments" : "Current government only"}`);

    // Le dry-run passe par le service : mêmes lectures et décisions, aucune écriture.
    const result = await syncGouvernement({
      currentOnly: !all,
      dryRun: dryRun === true,
      allowDuringGovernmentMigration: allowDuringGovernmentMigration === true,
    });

    return {
      success: result.success,
      duration: 0,
      stats: {
        membersCreated: result.membersCreated,
        membersUpdated: result.membersUpdated,
        mandatesCreated: result.mandatesCreated,
        planCreates: result.plan.creates.length,
        planUpdates: result.plan.updates.length,
        planLinks: result.plan.links.length,
        toVerify: result.plan.toVerify.length,
        unresolvedLabels: result.plan.unresolvedLabels.length,
        skippedActVerified: result.plan.skippedActVerified.length,
      },
      errors: result.errors,
    };
  },
};

createCLI(handler);
