/**
 * Service to download .docx documents and extract exposé des motifs.
 * Extracted from scripts/sync-legislation-content.ts for Inngest compatibility.
 */

import { db } from "@/lib/db";
import mammoth from "mammoth";
import { ASSEMBLEE_DOCPARL_RATE_LIMIT_MS } from "@/config/rate-limits";
import { HTTPClient, HTTPError, describeError } from "@/lib/api/http-client";

const DOCPARL_URL_TEMPLATE =
  "https://docparl.assemblee-nationale.fr/base/{id}?format=application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const EXPOSE_REGEX =
  /EXPOS[\u00c9Ee\u00e9]\s+DES\s+MOTIFS\s*([\s\S]*?)(?=TITRE\s+[IVX]|Article\s+(?:1er|premier|unique)|CHAPITRE|$)/i;

const MAX_FALLBACK_LENGTH = 5000;

export interface LegislationContentSyncResult {
  processed: number;
  downloaded: number;
  extracted: number;
  notFound: number;
  skipped: number;
  errors: string[];
}

async function downloadDocx(documentId: string): Promise<Buffer | null> {
  const docparlClient = new HTTPClient({
    rateLimitMs: ASSEMBLEE_DOCPARL_RATE_LIMIT_MS,
    retries: 3,
    timeout: 60_000,
    sourceName: "docparl AN",
  });

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

async function extractText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

function extractExposeDesMotifs(fullText: string): string | null {
  const match = fullText.match(EXPOSE_REGEX);

  if (match && match[1]) {
    const expose = match[1].trim();
    if (expose.length > 50) {
      return expose;
    }
  }

  const trimmed = fullText.trim();
  if (trimmed.length > 100) {
    return trimmed.slice(0, MAX_FALLBACK_LENGTH);
  }

  return null;
}

export async function syncLegislationContent(options?: {
  limit?: number;
  force?: boolean;
}): Promise<LegislationContentSyncResult> {
  const { limit, force = false } = options ?? {};

  const stats: LegislationContentSyncResult = {
    processed: 0,
    downloaded: 0,
    extracted: 0,
    notFound: 0,
    skipped: 0,
    errors: [],
  };

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

  console.log(`Found ${dossiers.length} dossiers to process`);

  if (dossiers.length === 0) {
    return stats;
  }

  for (const dossier of dossiers) {
    const docId = dossier.documentExternalId!;

    try {
      const buffer = await downloadDocx(docId);

      if (!buffer) {
        stats.notFound++;
        stats.processed++;
        continue;
      }

      stats.downloaded++;

      const fullText = await extractText(buffer);
      const expose = extractExposeDesMotifs(fullText);

      if (expose) {
        await db.legislativeDossier.update({
          where: { id: dossier.id },
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
      stats.errors.push(`${dossier.externalId}: ${describeError(err)}`);
      stats.processed++;
    }
  }

  return stats;
}
