/**
 * CLI script to download .docx documents and extract exposé des motifs
 * from legislative dossiers (Assemblée nationale).
 *
 * Usage:
 *   npm run sync:legislation:content              # Sync missing exposés
 *   npm run sync:legislation:content -- --limit=5 # Limit to N dossiers
 *   npm run sync:legislation:content -- --stats   # Show current stats
 *   npm run sync:legislation:content -- --force   # Re-download all
 *   npm run sync:legislation:content -- --dry-run # Preview without writing
 *
 * Data source: docparl.assemblee-nationale.fr (official documents)
 * Requires: mammoth (npm install mammoth)
 */

import "dotenv/config";
import { createCLI, type SyncHandler, type SyncResult } from "../src/lib/sync";
import { db } from "../src/lib/db";
import mammoth from "mammoth";
import { ASSEMBLEE_DOCPARL_RATE_LIMIT_MS } from "../src/config/rate-limits";
import { HTTPClient, HTTPError, describeError } from "../src/lib/api/http-client";

// Configuration
const DOCPARL_URL_TEMPLATE =
  "https://docparl.assemblee-nationale.fr/base/{id}?format=application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const docparlClient = new HTTPClient({
  rateLimitMs: ASSEMBLEE_DOCPARL_RATE_LIMIT_MS,
  retries: 3,
  timeout: 60_000,
  sourceName: "docparl AN",
});

// Regex to extract exposé des motifs section from document text
const EXPOSE_REGEX =
  /EXPOS[ÉEé]\s+DES\s+MOTIFS\s*([\s\S]*?)(?=TITRE\s+[IVX]|Article\s+(?:1er|premier|unique)|CHAPITRE|$)/i;

// Max length for fallback (when no expose section found)
const MAX_FALLBACK_LENGTH = 5000;

/**
 * Download a .docx file from docparl and return the buffer
 */
async function downloadDocx(documentId: string): Promise<Buffer | null> {
  const url = DOCPARL_URL_TEMPLATE.replace("{id}", documentId);

  try {
    const { data } = await docparlClient.getBuffer(url, {
      headers: {
        Accept: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    });
    return data;
  } catch (err) {
    if (err instanceof HTTPError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * Extract text from a .docx buffer using mammoth
 */
async function extractText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

/**
 * Extract the exposé des motifs section from full document text
 */
function extractExposeDesMotifs(fullText: string): string | null {
  const match = fullText.match(EXPOSE_REGEX);

  if (match && match[1]) {
    const expose = match[1].trim();
    // Ignore if too short (likely a false match)
    if (expose.length > 50) {
      return expose;
    }
  }

  // Fallback: return first N chars of document if it has meaningful content
  const trimmed = fullText.trim();
  if (trimmed.length > 100) {
    return trimmed.slice(0, MAX_FALLBACK_LENGTH);
  }

  return null;
}

const handler: SyncHandler = {
  name: "Politic Tracker - Legislative Content Sync",
  description: "Download .docx and extract exposé des motifs from AN documents",

  options: [
    {
      name: "--force",
      type: "boolean",
      description: "Re-download all documents (even already processed)",
    },
  ],

  showHelp() {
    console.log(`
Politic Tracker - Legislative Content Sync

Downloads .docx documents from docparl.assemblee-nationale.fr and extracts
the "exposé des motifs" section to enrich legislative dossier summaries.

Prerequisites:
  - Run sync:legislation first to populate documentExternalId
  - mammoth package must be installed (npm install mammoth)

Features:
  - Downloads official .docx documents from AN
  - Extracts exposé des motifs via regex
  - Falls back to first 5000 chars if no section found
  - Rate-limited (300ms between requests)
  - Skips 404s silently (document not available)
    `);
  },

  async showStats() {
    const total = await db.legislativeDossier.count();
    const withDocId = await db.legislativeDossier.count({
      where: { documentExternalId: { not: null } },
    });
    const withExpose = await db.legislativeDossier.count({
      where: { exposeDesMotifs: { not: null } },
    });
    const pendingDownload = await db.legislativeDossier.count({
      where: {
        documentExternalId: { not: null },
        exposeDesMotifs: null,
      },
    });

    const bySource = await db.legislativeDossier.groupBy({
      by: ["exposeSource"],
      _count: true,
      where: { exposeDesMotifs: { not: null } },
    });

    console.log("\n" + "=".repeat(50));
    console.log("Legislative Content Stats");
    console.log("=".repeat(50));
    console.log(`Total dossiers: ${total}`);
    console.log(`With document ID: ${withDocId}`);
    console.log(
      `With exposé des motifs: ${withExpose} (${total > 0 ? ((withExpose / total) * 100).toFixed(1) : 0}%)`
    );
    console.log(`Pending download: ${pendingDownload}`);

    if (bySource.length > 0) {
      console.log("\nBy source:");
      for (const s of bySource) {
        console.log(`  ${s.exposeSource || "(unknown)"}: ${s._count}`);
      }
    }
  },

  async sync(options): Promise<SyncResult> {
    const {
      dryRun = false,
      limit,
      force = false,
    } = options as {
      dryRun?: boolean;
      limit?: number;
      force?: boolean;
    };

    const stats = {
      processed: 0,
      downloaded: 0,
      extracted: 0,
      notFound: 0,
      skipped: 0,
    };
    const errors: string[] = [];

    // Find dossiers to process
    const whereClause: Record<string, unknown> = {
      documentExternalId: { not: null },
    };

    if (!force) {
      whereClause.exposeDesMotifs = null;
    }

    let dossiers = await db.legislativeDossier.findMany({
      where: whereClause,
      select: {
        id: true,
        externalId: true,
        documentExternalId: true,
        title: true,
      },
      orderBy: { filingDate: "desc" },
    });

    if (limit) {
      dossiers = dossiers.slice(0, limit);
    }

    const total = dossiers.length;
    console.log(`Found ${total} dossiers to process\n`);

    if (total === 0) {
      console.log("✓ No dossiers need content download");
      return { success: true, duration: 0, stats, errors };
    }

    for (let i = 0; i < dossiers.length; i++) {
      const dossier = dossiers[i];
      const docId = dossier!.documentExternalId!;

      const progress = `[${i + 1}/${total}]`;
      process.stdout.write(`\r${progress} Downloading ${docId}...                    `);

      try {
        if (dryRun) {
          stats.downloaded++;
          stats.extracted++;
          stats.processed++;
          continue;
        }

        // Download .docx
        const buffer = await downloadDocx(docId);

        if (!buffer) {
          stats.notFound++;
          stats.processed++;
          continue;
        }

        stats.downloaded++;

        // Extract text
        const fullText = await extractText(buffer);
        const expose = extractExposeDesMotifs(fullText);

        if (expose) {
          await db.legislativeDossier.update({
            where: { id: dossier!.id },
            data: {
              exposeDesMotifs: expose,
              exposeSource: "docparl",
            },
          });
          stats.extracted++;
        } else {
          stats.skipped++;
        }

        stats.processed++;
      } catch (err) {
        const msg = `${dossier!.externalId}: ${describeError(err)}`;
        errors.push(msg);
        stats.processed++;
      }
    }

    console.log(""); // New line after progress

    return {
      success: errors.length === 0,
      duration: 0,
      stats,
      errors,
    };
  },
};

createCLI(handler);
