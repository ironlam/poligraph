/**
 * Service to download parliamentary documents and extract their exposé des motifs.
 *
 * Source: the Assemblée nationale open data document endpoint,
 * `https://www.assemblee-nationale.fr/dyn/opendata/{uid}.html`, which serves the
 * full text of a bill or report keyed by the same uid as `documentExternalId`.
 *
 * It replaces docparl.assemblee-nationale.fr, which served the same documents as
 * .docx until the host was removed from DNS: every request then failed with
 * `getaddrinfo ENOTFOUND`, and the daily sync stopped importing exposés.
 */

import { db } from "@/lib/db";
import { extractBlockText } from "@/lib/parsing/html-block-text";
import { ASSEMBLEE_OPENDATA_RATE_LIMIT_MS } from "@/config/rate-limits";
import {
  HTTPClient,
  HTTPError,
  describeError,
  isUnresolvableHostError,
} from "@/lib/api/http-client";

export const DOCUMENT_HOST = "www.assemblee-nationale.fr";

const DOCUMENT_URL_TEMPLATE = `https://${DOCUMENT_HOST}/dyn/opendata/{id}.html`;

/** Value written to `LegislativeDossier.exposeSource` for this pipeline. */
export const EXPOSE_SOURCE = "an-opendata";

const EXPOSE_REGEX =
  /EXPOS[ÉEeé]\s+DES\s+MOTIFS\s*([\s\S]*?)(?=TITRE\s+[IVX]|Article\s+(?:1er|premier|unique)|CHAPITRE|$)/i;

const MAX_FALLBACK_LENGTH = 5000;

/**
 * A whole batch failing the same way means the endpoint moved or broke, not that
 * the AN published nothing: one missing document is routine, a run where every
 * single one fails is a source problem. Raised as an exception so a silent no-op
 * cannot pass for a successful sync, which is how the docparl breakage would
 * have looked had the host kept resolving.
 */
const ALL_MISSING_ALERT_THRESHOLD = 5;

/**
 * A parliamentary text carries at least one of these.
 *
 * The AN can answer 200 with a maintenance page, a WAF challenge or a redirect
 * landing page. Its body is readable text longer than the fallback threshold
 * below, so without this check the sync would store it as an exposé des motifs
 * under the trusted "an-opendata" source, where `generate-dossier-summaries` and
 * the policy-title substance resolver read it as official evidence. The .docx
 * source ruled that out by format alone (a maintenance page is not a valid
 * archive); HTML gives no such guarantee, so the marker is checked explicitly.
 */
const DOCUMENT_MARKER_REGEX =
  /EXPOS[ÉEeé]\s+DES\s+MOTIFS|PROPOSITION\s+DE\s+(?:LOI|R[ÉEeé]SOLUTION)|PROJET\s+DE\s+LOI|RAPPORT\s+FAIT\s+AU\s+NOM|ARTICLE\s+(?:1ER|PREMIER|UNIQUE)/i;

/** Raised when the whole run failed the same way: the source, not the dossiers. */
export class LegislationContentBatchError extends Error {
  constructor(
    message: string,
    readonly stats: LegislationContentSyncResult
  ) {
    super(message);
    this.name = "LegislationContentBatchError";
  }
}

/**
 * Whether a downloaded page is an AN parliamentary text rather than an error,
 * maintenance or challenge page served with HTTP 200.
 */
export function looksLikeParliamentaryDocument(text: string): boolean {
  return DOCUMENT_MARKER_REGEX.test(text);
}

export interface LegislationContentSyncResult {
  processed: number;
  downloaded: number;
  extracted: number;
  notFound: number;
  skipped: number;
  errors: string[];
}

export function buildDocumentUrl(documentId: string): string {
  return DOCUMENT_URL_TEMPLATE.replace("{id}", encodeURIComponent(documentId));
}

async function touchExposeCheckedAt(id: string): Promise<void> {
  await db.legislativeDossier.update({
    where: { id },
    data: { exposeCheckedAt: new Date() },
  });
}

function createClient(): HTTPClient {
  return new HTTPClient({
    rateLimitMs: ASSEMBLEE_OPENDATA_RATE_LIMIT_MS,
    retries: 3,
    timeout: 60_000,
    sourceName: "opendata AN",
  });
}

/**
 * Download a document and return its text, or null when the AN has no such
 * document (404 — a dossier whose text was never published in open data).
 */
export async function downloadDocumentText(
  documentId: string,
  client: HTTPClient = createClient()
): Promise<string | null> {
  try {
    const { data } = await client.getText(buildDocumentUrl(documentId), {
      headers: { Accept: "text/html" },
    });
    return extractBlockText(data);
  } catch (err) {
    if (err instanceof HTTPError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

export function extractExposeDesMotifs(fullText: string): string | null {
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

export interface LegislationContentSyncOptions {
  limit?: number;
  force?: boolean;
  /** Count the dossiers that would be processed without fetching or writing. */
  dryRun?: boolean;
  /** Called before each download, for CLI progress display. */
  onProgress?: (done: number, total: number, documentId: string) => void;
}

export async function syncLegislationContent(
  options?: LegislationContentSyncOptions
): Promise<LegislationContentSyncResult> {
  const { limit, force = false, dryRun = false, onProgress } = options ?? {};

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
      exposeCheckedAt: true,
    },
    // Never-checked dossiers first, then the ones checked longest ago. Without
    // this cursor a dossier the AN will never publish (a Senate-originated text
    // requested against the AN endpoint, or one filed but not yet released)
    // stays permanently null and, sorted by filingDate alone, permanently
    // outranks everything filed earlier — the backlog stops advancing. The
    // migration backfills exposeCheckedAt for every dossier that existed at
    // deploy time, so "never checked" only ever means "created since"; filingDate
    // breaks ties among dossiers at the same rotation stage.
    orderBy: [{ exposeCheckedAt: { sort: "asc", nulls: "first" } }, { filingDate: "desc" }],
  });

  if (limit) {
    dossiers = dossiers.slice(0, limit);
  }

  const total = dossiers.length;
  console.log(`Found ${total} dossiers to process`);

  if (total === 0) {
    return stats;
  }

  const client = createClient();
  let batchFailure: string | null = null;

  // Scoped to dossiers with no prior exposeCheckedAt: the rotation cursor above
  // means a normal run increasingly draws from the pool of documents already
  // known to 404 forever (Senate-originated texts requested against the AN
  // endpoint), which would otherwise trip the "all missing" guard below on any
  // ordinary day. Only a first attempt failing signals the endpoint itself is
  // broken; a known-dead document 404ing again is the rotation working as
  // designed.
  let firstAttempts = 0;
  let firstAttemptsNotFound = 0;

  for (let i = 0; i < dossiers.length; i++) {
    const dossier = dossiers[i]!;
    const docId = dossier.documentExternalId!;
    const isFirstAttempt = dossier.exposeCheckedAt === null;

    onProgress?.(i + 1, total, docId);

    try {
      if (dryRun) {
        stats.downloaded++;
        stats.extracted++;
        stats.processed++;
        continue;
      }

      const fullText = await downloadDocumentText(docId, client);

      if (fullText === null) {
        // A definitive "no such document" answer, not a network hiccup: record
        // it so this dossier moves to the back of the rotation instead of
        // occupying the top slot on every future run.
        await touchExposeCheckedAt(dossier.id);
        if (isFirstAttempt) {
          firstAttempts++;
          firstAttemptsNotFound++;
        }
        stats.notFound++;
        stats.processed++;
        continue;
      }

      stats.downloaded++;

      if (!looksLikeParliamentaryDocument(fullText)) {
        await touchExposeCheckedAt(dossier.id);
        if (isFirstAttempt) firstAttempts++;
        stats.skipped++;
        stats.processed++;
        continue;
      }

      const expose = extractExposeDesMotifs(fullText);

      if (expose) {
        await db.legislativeDossier.update({
          where: { id: dossier.id },
          data: {
            exposeDesMotifs: expose,
            exposeSource: EXPOSE_SOURCE,
            exposeCheckedAt: new Date(),
          },
        });
        stats.extracted++;
      } else {
        await touchExposeCheckedAt(dossier.id);
        stats.skipped++;
      }

      if (isFirstAttempt) firstAttempts++;
      stats.processed++;
    } catch (err) {
      stats.errors.push(`${dossier.externalId}: ${describeError(err)}`);
      stats.processed++;

      // Left unstamped on purpose: a network error or timeout says nothing
      // about the document itself, so the dossier stays at the front of the
      // rotation and is retried on the next run rather than waiting a full
      // cycle through the backlog.

      // A host that no longer resolves fails identically on every remaining
      // dossier. Stop here so the run reports the dead source once instead of
      // one line per dossier, which is how the docparl removal surfaced.
      if (isUnresolvableHostError(err)) {
        batchFailure = `${DOCUMENT_HOST} does not resolve, ${total - stats.processed} dossiers left unprocessed`;
        break;
      }
    }
  }

  if (
    !batchFailure &&
    firstAttempts >= ALL_MISSING_ALERT_THRESHOLD &&
    firstAttemptsNotFound === firstAttempts
  ) {
    batchFailure = `all ${firstAttempts} never-checked-before documents answered 404 on ${DOCUMENT_HOST} (${stats.notFound} 404s in this run overall, including known-missing ones back for their scheduled recheck), the open data URL scheme has most likely changed`;
  }

  if (!batchFailure && stats.extracted === 0 && stats.downloaded >= ALL_MISSING_ALERT_THRESHOLD) {
    batchFailure = `none of the ${stats.downloaded} pages fetched from ${DOCUMENT_HOST} carried a parliamentary text, the endpoint is probably serving an error or maintenance page`;
  }

  // Thrown rather than returned: the callers that retry (both Inngest jobs) only
  // look at whether the step settled, so a batch failure reported in `errors`
  // would be recorded as a completed sync that imported nothing.
  if (batchFailure) {
    throw new LegislationContentBatchError(
      `Legislative content sync aborted: ${batchFailure} (processed ${stats.processed}/${total}, extracted ${stats.extracted})`,
      stats
    );
  }

  return stats;
}
