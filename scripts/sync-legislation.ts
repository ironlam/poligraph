/**
 * CLI entrypoint for the Assemblée nationale legislative dossier sync.
 *
 * All import behavior lives in `src/services/sync/legislation.ts`; keeping this
 * file as a thin adapter ensures scheduled and operator runs exercise the same
 * implementation and tests.
 */

import "dotenv/config";
import { createCLI, type SyncHandler, type SyncResult } from "../src/lib/sync";
import { db } from "../src/lib/db";
import { syncLegislation } from "../src/services/sync/legislation";

const DEFAULT_LEGISLATURE = 17;

export const legislationSyncHandler: SyncHandler = {
  name: "Politic Tracker - Legislative Dossiers Sync",
  description: "Import dossiers législatifs from Assemblée nationale",

  options: [
    {
      name: "--leg",
      type: "string",
      description: `Legislature number (default: ${DEFAULT_LEGISLATURE})`,
    },
    {
      name: "--active",
      type: "boolean",
      description: "Only sync active dossiers (excludes ADOPTE/REJETE/RETIRE/CADUQUE)",
    },
    {
      name: "--origin-only",
      type: "boolean",
      description: "Backfill origin fields on existing dossiers for the selected legislature",
    },
    {
      name: "--today",
      type: "boolean",
      description: "Only process dossiers modified today",
    },
    {
      name: "--since-days",
      type: "number",
      description: "Only process dossiers whose most recent act date is within N days",
    },
  ],

  showHelp() {
    console.log(`
Politic Tracker - Dossiers Législatifs Sync

Data source: data.assemblee-nationale.fr (official Open Data)

Features:
  - Downloads official ZIP file with all legislative dossiers
  - Parses dossier status from parliamentary acts (PROM = adopted)
  - Categorizes dossiers by procedure type
  - Creates/updates LegislativeDossier records
    `);
  },

  async showStats() {
    const dossiersCount = await db.legislativeDossier.count();
    const byStatus = await db.legislativeDossier.groupBy({
      by: ["status"],
      _count: true,
      orderBy: { _count: { status: "desc" } },
    });
    const byCategory = await db.legislativeDossier.groupBy({
      by: ["category"],
      _count: true,
      orderBy: { _count: { category: "desc" } },
    });
    const recentDossiers = await db.legislativeDossier.findMany({
      where: { status: "EN_COURS" },
      orderBy: { filingDate: "desc" },
      take: 5,
      select: { title: true, number: true, category: true, filingDate: true },
    });

    console.log("\n" + "=".repeat(50));
    console.log("Legislative Dossiers Stats");
    console.log("=".repeat(50));
    console.log(`Total dossiers: ${dossiersCount}`);

    if (byStatus.length > 0) {
      console.log("\nBy status:");
      for (const status of byStatus) console.log(`  ${status.status}: ${status._count}`);
    }
    if (byCategory.length > 0) {
      console.log("\nBy category:");
      for (const category of byCategory) {
        console.log(`  ${category.category || "(none)"}: ${category._count}`);
      }
    }
    if (recentDossiers.length > 0) {
      console.log("\nRecent active dossiers:");
      for (const dossier of recentDossiers) {
        const date = dossier.filingDate ? dossier.filingDate.toISOString().split("T")[0] : "N/A";
        console.log(`  - ${dossier.number || "?"}: ${dossier.title.substring(0, 50)}... (${date})`);
      }
    }
  },

  async sync(options): Promise<SyncResult> {
    const {
      dryRun = false,
      originOnly = false,
      limit,
      leg,
      active = false,
      today = false,
      sinceDays,
    } = options as {
      dryRun?: boolean;
      originOnly?: boolean;
      limit?: number;
      leg?: string;
      active?: boolean;
      today?: boolean;
      sinceDays?: number;
    };

    const legislature = leg ? Number.parseInt(leg, 10) : DEFAULT_LEGISLATURE;
    if (!Number.isInteger(legislature) || legislature < 1) {
      return {
        success: false,
        duration: 0,
        stats: {},
        errors: ["Invalid legislature number"],
      };
    }

    console.log(`Legislature: ${legislature}e`);
    if (active) console.log("Filter: Active dossiers only");
    if (today) console.log("Filter: Dossiers modified today only");
    if (sinceDays !== undefined) console.log(`Filter: Dossiers modified within ${sinceDays} days`);
    if (originOnly) console.log("Mode: Origin fields only, existing dossiers only");
    if (dryRun) console.log("Mode: Dry run, no database writes");

    const result = await syncLegislation({
      legislature,
      originOnly,
      dryRun,
      limit,
      activeOnly: active,
      todayOnly: today,
      sinceDays,
    });

    return {
      success: result.errors.length === 0,
      duration: 0,
      stats: {
        processed: result.dossiersProcessed,
        created: result.dossiersCreated,
        updated: result.dossiersUpdated,
        skipped: result.dossiersSkipped,
      },
      errors: result.errors,
    };
  },
};

createCLI(legislationSyncHandler);
