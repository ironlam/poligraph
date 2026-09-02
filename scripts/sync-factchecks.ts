/**
 * CLI script to sync fact-checks from Google Fact Check Tools API
 *
 * Searches for fact-checked claims mentioning French politicians and stores them.
 *
 * Usage:
 *   npm run sync:factchecks                    # Sync active politicians
 *   npm run sync:factchecks -- --all           # Sync all politicians
 *   npm run sync:factchecks -- --stats         # Show current stats
 *   npm run sync:factchecks -- --dry-run       # Preview without saving
 *   npm run sync:factchecks -- --limit=10      # Limit to N politicians
 *   npm run sync:factchecks -- --politician="Macron"  # Search specific politician
 */

import "dotenv/config";
import { createCLI, type SyncHandler, type SyncResult } from "../src/lib/sync";
import { syncFactchecks } from "../src/services/sync/factchecks";
import { db } from "../src/lib/db";

// ============================================
// SYNC HANDLER
// ============================================

const handler: SyncHandler = {
  name: "Politic Tracker - Fact-Check Sync (Google API)",
  description: "Syncs fact-checks from Google Fact Check Tools API and matches politicians",

  options: [
    {
      name: "--politician",
      type: "string",
      description: "Search fact-checks for a specific politician name",
    },
    {
      name: "--all",
      type: "boolean",
      description: "Search all politicians (default: only active mandates)",
    },
  ],

  showHelp() {
    console.log(`
Politic Tracker - Fact-Check Sync (Google Fact Check Tools API)

Searches for fact-checked claims about French politicians using the
Google Fact Check Tools API (ClaimReview standard).

Sources include: AFP Factuel, Les Décodeurs, Libération CheckNews, etc.

Options:
  --stats              Show current statistics
  --dry-run            Preview changes without saving
  --limit=N            Limit to N politicians
  --politician="Name"  Search specific politician
  --all                Search all politicians (default: active only)
  --force              Re-import even if already exists
  --help               Show this help message

Environment:
  GOOGLE_FACTCHECK_API_KEY   Required. Google API key with Fact Check API enabled.
    `);
  },

  async showStats() {
    const [
      totalFactChecks,
      factChecksByRating,
      factChecksBySource,
      totalMentions,
      topMentioned,
      recentFactChecks,
    ] = await Promise.all([
      db.factCheck.count(),
      db.factCheck.groupBy({
        by: ["verdictRating"],
        _count: true,
        orderBy: { _count: { verdictRating: "desc" } },
      }),
      db.factCheck.groupBy({
        by: ["source"],
        _count: true,
        orderBy: { _count: { source: "desc" } },
      }),
      db.factCheckMention.count(),
      db.$queryRaw<Array<{ fullName: string; count: bigint }>>`
        SELECT p."fullName", COUNT(*) as count
        FROM "FactCheckMention" m
        JOIN "Politician" p ON m."politicianId" = p.id
        GROUP BY p.id, p."fullName"
        ORDER BY count DESC
        LIMIT 10
      `,
      db.factCheck.findMany({
        orderBy: { publishedAt: "desc" },
        take: 5,
        select: {
          title: true,
          source: true,
          verdictRating: true,
          publishedAt: true,
          _count: { select: { mentions: true } },
        },
      }),
    ]);

    console.log("\n" + "=".repeat(60));
    console.log("Fact-Check Sync Stats");
    console.log("=".repeat(60));
    console.log(`\nTotal fact-checks: ${totalFactChecks}`);
    console.log(`Total politician mentions: ${totalMentions}`);

    console.log("\nBy verdict:");
    for (const { verdictRating, _count } of factChecksByRating) {
      console.log(`  ${verdictRating}: ${_count}`);
    }

    console.log("\nBy source:");
    for (const { source, _count } of factChecksBySource) {
      console.log(`  ${source}: ${_count}`);
    }

    console.log("\nTop 10 mentioned politicians:");
    for (const { fullName, count } of topMentioned) {
      console.log(`  ${fullName}: ${count}`);
    }

    console.log("\nRecent fact-checks:");
    for (const fc of recentFactChecks) {
      const date = fc.publishedAt.toISOString().split("T")[0];
      console.log(`  [${date}] [${fc.verdictRating}] ${fc.title.slice(0, 60)}...`);
      console.log(`    Source: ${fc.source}, Politicians: ${fc._count.mentions}`);
    }
  },

  async sync(options): Promise<SyncResult> {
    const {
      dryRun = false,
      force = false,
      limit,
      politician,
      all = false,
    } = options as {
      dryRun?: boolean;
      force?: boolean;
      limit?: number;
      politician?: string;
      all?: boolean;
    };

    const stats = await syncFactchecks({ dryRun, force, limit, politician, all });

    return {
      success: stats.errors.length === 0,
      duration: 0,
      stats: {
        politiciansSearched: stats.politiciansSearched,
        searchPoolSize: stats.searchPoolSize,
        rotationOffset: stats.rotationOffset,
        claimsFound: stats.claimsFound,
        factChecksCreated: stats.factChecksCreated,
        factChecksSkipped: stats.factChecksSkipped,
        mentionsCreated: stats.mentionsCreated,
        apiErrors: stats.apiErrors,
      },
      errors: stats.errors,
    };
  },
};

createCLI(handler);
