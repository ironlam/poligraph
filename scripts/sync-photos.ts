/**
 * CLI script to sync photos for politicians
 *
 * Usage:
 *   npm run sync:photos              # Sync photos for politicians without photos
 *   npm run sync:photos -- --validate # Also validate existing photos
 *   npm run sync:photos -- --stats   # Show current stats
 */

import "dotenv/config";
import { createCLI, type SyncHandler, type SyncResult } from "../src/lib/sync";
import { syncPhotos, getPhotoStats, getSyncStats } from "../src/services/sync";

const handler: SyncHandler = {
  name: "Politic Tracker - Photo Sync",
  description: "Sync politician photos from multiple sources",

  options: [
    {
      name: "--validate",
      type: "boolean",
      description:
        "Validate existing photos only and fix broken ones (skips politicians without a photo)",
    },
    {
      name: "--slug",
      type: "string",
      description:
        "Only these politicians, comma-separated slugs (e.g. jordan-bardella,bally-bagayoko)",
    },
  ],

  showHelp() {
    console.log(`
Politic Tracker - Photo Sync

Photo sources (priority order):
  1. Assemblée nationale / Sénat (official photos)
  2. HATVP (official declarations)
  3. NosDéputés / NosSénateurs
  4. Wikidata
    `);
  },

  async showStats() {
    const [photoStats, globalStats] = await Promise.all([getPhotoStats(), getSyncStats()]);

    console.log("\n" + "=".repeat(50));
    console.log("Photo Stats");
    console.log("=".repeat(50));
    console.log(`Total politicians: ${globalStats.politicians}`);
    console.log(`\nWith photo: ${photoStats.withPhoto}`);
    console.log(`Without photo: ${photoStats.withoutPhoto}`);
    console.log(`Coverage: ${((photoStats.withPhoto / photoStats.total) * 100).toFixed(1)}%`);
    console.log("\nBy source:");
    for (const [source, count] of Object.entries(photoStats.bySource)) {
      console.log(`  ${source}: ${count}`);
    }
  },

  async sync(options): Promise<SyncResult> {
    const {
      dryRun = false,
      validate = false,
      limit,
      slug,
    } = options as {
      dryRun?: boolean;
      validate?: boolean;
      limit?: number;
      slug?: string;
    };
    const slugs = slug
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (dryRun) {
      console.log(`[DRY-RUN] Would sync photos ${validate ? "with validation" : ""}`);
      return { success: true, duration: 0, stats: {}, errors: [] };
    }

    const target = slugs?.length ? ` (${slugs.length} slug(s))` : "";
    console.log(`Mode: ${validate ? "Validate existing photos" : "Sync missing only"}${target}`);

    const result = await syncPhotos({ validateExisting: validate as boolean, limit, slugs });

    const stats: Record<string, number> = {
      checked: result.checked,
      updated: result.updated,
    };

    if (validate) {
      stats.validated = result.validated;
      stats.invalidUrls = result.invalidUrls;
    }

    return {
      success: result.success,
      duration: 0,
      stats,
      errors: result.errors,
    };
  },
};

createCLI(handler);
