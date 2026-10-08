/**
 * CLI script to enrich politicians with Wikidata IDs
 *
 * Strategy: For each politician in our DB, search Wikidata by name.
 * This is more efficient than fetching all French politicians from Wikidata.
 *
 * Usage:
 *   npm run sync:wikidata-ids              # Sync Wikidata IDs
 *   npm run sync:wikidata-ids -- --stats   # Show current stats
 *   npm run sync:wikidata-ids -- --dry-run # Preview without saving
 *   npm run sync:wikidata-ids -- --limit=100 # Process only 100 politicians
 *   npm run sync:wikidata-ids -- --resume  # Resume from last checkpoint
 */

import "dotenv/config";
import {
  createCLI,
  ProgressTracker,
  CheckpointManager,
  type SyncHandler,
  type SyncResult,
} from "../src/lib/sync";
import { WikidataService, POLITICAL_POSITIONS } from "../src/lib/api";
import { db } from "../src/lib/db";
import { WIKIDATA_RATE_LIMIT_MS } from "../src/config/rate-limits";
import { DataSource } from "../src/generated/prisma";
import { findBestMatch, type WikidataCandidate } from "../src/services/sync/wikidata-ids-match";

const handler: SyncHandler = {
  name: "Politic Tracker - Wikidata ID Sync",
  description: "Associate Wikidata IDs to politicians by name matching",

  options: [
    {
      name: "--resume",
      type: "boolean",
      description: "Resume from last checkpoint",
    },
  ],

  showHelp() {
    console.log(`
Politic Tracker - Wikidata ID Sync

Strategy: For each politician in our DB, search Wikidata by name and match
by birth date when there are multiple candidates.

Features:
  - Checkpoint support: use --resume to continue after interruption
  - Uses WikidataService with retry and rate limiting
    `);
  },

  async showStats() {
    const [totalPoliticians, withWikidata, withoutWikidata] = await Promise.all([
      db.politician.count(),
      db.externalId.count({
        where: {
          source: DataSource.WIKIDATA,
          politicianId: { not: null },
        },
      }),
      db.politician.count({
        where: {
          externalIds: {
            none: { source: DataSource.WIKIDATA },
          },
        },
      }),
    ]);

    console.log("\n" + "=".repeat(50));
    console.log("Wikidata ID Stats");
    console.log("=".repeat(50));
    console.log(`Total politicians: ${totalPoliticians}`);
    console.log(
      `With Wikidata ID: ${withWikidata} (${((withWikidata / totalPoliticians) * 100).toFixed(1)}%)`
    );
    console.log(`Without Wikidata ID: ${withoutWikidata}`);
  },

  async sync(options): Promise<SyncResult> {
    const {
      dryRun = false,
      limit,
      resume = false,
    } = options as {
      dryRun?: boolean;
      limit?: number;
      resume?: boolean;
    };

    const wikidata = new WikidataService({ rateLimitMs: WIKIDATA_RATE_LIMIT_MS });
    const checkpoint = new CheckpointManager("sync-wikidata-ids", { autoSaveInterval: 25 });

    const stats = {
      processed: 0,
      idsCreated: 0,
      alreadyUsed: 0,
      noMatch: 0,
      multipleMatches: 0,
    };
    const errors: string[] = [];

    // Check for resume
    let startIndex = 0;
    if (resume && checkpoint.canResume()) {
      const resumeData = checkpoint.resume();
      if (resumeData) {
        startIndex = (resumeData.fromIndex ?? 0) + 1;
        stats.processed = resumeData.processedCount;
        console.log(`Resuming from index ${startIndex}\n`);
      }
    } else {
      checkpoint.start();
    }

    console.log("Fetching politicians from database...");

    const politicians = await db.politician.findMany({
      where: {
        externalIds: {
          none: { source: DataSource.WIKIDATA },
        },
      },
      select: {
        id: true,
        fullName: true,
        firstName: true,
        lastName: true,
        birthDate: true,
      },
      take: limit,
      orderBy: { lastName: "asc" },
    });

    console.log(`Found ${politicians.length} politicians without Wikidata ID\n`);

    if (politicians.length === 0) {
      checkpoint.complete();
      return { success: true, duration: 0, stats, errors };
    }

    const progress = new ProgressTracker({
      total: politicians.length,
      label: "Matching Wikidata IDs",
      showBar: true,
      showETA: true,
      logInterval: 25,
    });

    for (let i = startIndex; i < politicians.length; i++) {
      const politician = politicians[i];
      stats.processed++;

      try {
        // Search by name
        const searchResults = await wikidata.searchByName(politician!.fullName, { limit: 5 });

        if (searchResults.length === 0) {
          stats.noMatch++;
          progress.tick();
          checkpoint.tick(politician!.id, i);
          continue;
        }

        // Get details for all candidates
        const candidateIds = searchResults.map((r) => r.id);
        const candidateDetails = await wikidata.checkFrenchPoliticians(candidateIds);

        // Build candidate info list
        const candidates: WikidataCandidate[] = [];
        candidateDetails.forEach((details, id) => {
          const searchResult = searchResults.find((r) => r.id === id);
          if (details.isFrench) {
            candidates.push({
              id,
              label: searchResult?.label || id,
              isFrench: details.isFrench,
              isPolitician: details.isPolitician,
              birthDate: details.birthDate,
            });
          }
        });

        if (candidates.length === 0) {
          stats.noMatch++;
          progress.tick();
          checkpoint.tick(politician!.id, i);
          continue;
        }

        // Find best match
        const bestMatch = findBestMatch(candidates, politician!.birthDate);

        if (!bestMatch) {
          stats.multipleMatches++;
          progress.tick();
          checkpoint.tick(politician!.id, i);
          continue;
        }

        const wikidataId = bestMatch.id;
        const matchReason = bestMatch.isPolitician ? "(politician)" : "";

        if (dryRun) {
          console.log(`[DRY-RUN] ${politician!.fullName} -> ${wikidataId} ${matchReason}`);
          stats.idsCreated++;
        } else {
          // Check if this Wikidata ID is already used
          const existing = await db.externalId.findUnique({
            where: {
              source_externalId: {
                source: DataSource.WIKIDATA,
                externalId: wikidataId,
              },
            },
          });

          if (existing) {
            stats.alreadyUsed++;
            progress.tick();
            checkpoint.tick(politician!.id, i);
            continue;
          }

          await db.externalId.create({
            data: {
              politicianId: politician!.id,
              source: DataSource.WIKIDATA,
              externalId: wikidataId,
              url: `https://www.wikidata.org/wiki/${wikidataId}`,
            },
          });
          stats.idsCreated++;
          console.log(`✓ ${politician!.fullName} -> ${wikidataId} ${matchReason}`);
        }
      } catch (error) {
        errors.push(`${politician!.fullName}: ${error}`);
      }

      progress.tick();
      checkpoint.tick(politician!.id, i);
    }

    progress.finish();
    checkpoint.complete();

    return {
      success: errors.length === 0,
      duration: 0,
      stats,
      errors,
    };
  },
};

createCLI(handler);
