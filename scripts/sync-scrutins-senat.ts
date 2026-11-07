/**
 * CLI script to sync parliamentary votes from senat.fr
 *
 * Usage:
 *   npm run sync:scrutins-senat              # Sync current session
 *   npm run sync:scrutins-senat -- --all     # Sync all sessions
 *   npm run sync:scrutins-senat -- --session=2025  # Specific session
 *   npm run sync:scrutins-senat -- --today   # Only process today's scrutins
 *   npm run sync:scrutins-senat -- --stats   # Show current stats
 *
 * Data source: senat.fr (official Senate website)
 */

import "dotenv/config";
import { createCLI, type SyncHandler, type SyncResult } from "../src/lib/sync";
import {
  syncScrutinsSenat,
  getScrutinsSenatStats,
  AVAILABLE_SESSIONS,
  currentSenateSession,
} from "../src/services/sync/scrutins-senat";

const DEFAULT_SESSION = currentSenateSession();

const handler: SyncHandler = {
  name: "Politic Tracker - Senate Votes Sync",
  description: "Import scrutins and votes from Sénat",

  options: [
    {
      name: "--session",
      type: "string",
      description: `Session year (default: ${DEFAULT_SESSION}). Available: ${AVAILABLE_SESSIONS.join(", ")}`,
    },
    {
      name: "--all",
      type: "boolean",
      description: "Sync all sessions (2006-present)",
    },
    {
      name: "--today",
      type: "boolean",
      description: "Only process scrutins from today's date",
    },
  ],

  showHelp() {
    console.log(`
Politic Tracker - Votes Sync (Sénat)

Data source: senat.fr (official Senate website)

Features:
  - Scrapes scrutin list from session pages
  - Downloads JSON vote data for each scrutin
  - Parses metadata from HTML (title, date, results)
  - Matches senators by their matricule (ExternalId)
    `);
  },

  async showStats() {
    const stats = await getScrutinsSenatStats();

    console.log("\n" + "=".repeat(50));
    console.log("Senate Votes Stats");
    console.log("=".repeat(50));
    console.log(`Scrutins (Sénat): ${stats.scrutinsCount}`);
    console.log(`Total votes: ${stats.votesCount}`);

    if (stats.sessions.length > 0) {
      console.log("\nBy session:");
      for (const s of stats.sessions) {
        console.log(`  ${s.legislature}: ${s.count} scrutins`);
      }
    }
  },

  async sync(options): Promise<SyncResult> {
    const {
      dryRun = false,
      force = false,
      session: sessionStr,
      all = false,
      today = false,
    } = options as {
      dryRun?: boolean;
      force?: boolean;
      session?: string;
      all?: boolean;
      today?: boolean;
    };

    let session: number | null = DEFAULT_SESSION;

    if (sessionStr) {
      session = parseInt(sessionStr, 10);
      if (isNaN(session) || !AVAILABLE_SESSIONS.includes(session)) {
        return {
          success: false,
          duration: 0,
          stats: {},
          errors: [`Invalid session. Available: ${AVAILABLE_SESSIONS.join(", ")}`],
        };
      }
    }

    // --all overrides session
    if (all) {
      session = null;
      console.log("Syncing all sessions (2006-present)");
    } else {
      console.log(`Session: ${session}`);
    }

    if (today) console.log("Filter: Today's scrutins only");
    if (force) console.log("Mode: Full sync (--force)");

    const result = await syncScrutinsSenat(session, dryRun, today, force);

    return {
      success: result.errors.length === 0,
      duration: 0,
      stats: {
        processed: result.scrutinsProcessed,
        created: result.scrutinsCreated,
        updated: result.scrutinsUpdated,
        skipped: result.scrutinsSkipped,
        cursorSkipped: result.cursorSkipped,
        votesCreated: result.votesCreated,
        votesSkipped: result.votesSkipped,
        senatorsNotFound: result.senatorsNotFound.size,
      },
      errors: result.errors,
    };
  },
};

createCLI(handler);
