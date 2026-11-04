import { db } from "@/lib/db";
import { createHash } from "node:crypto";
import { hashFile } from "@/lib/sync/hash";
import { syncMetadata } from "@/lib/sync/sync-metadata";
import { downloadDebateArchive } from "./debate-transcript-download";
import { mkdtempSync, rmSync, readdirSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { extractZip } from "@/lib/parsing/unzip";
import { DEBATE_PARSER_VERSION, extractSeanceFromXml } from "./debate-transcript-parse";

const LEGISLATURE = 17;
// Each run extracts into its own directory: a fixed path let one run delete the
// archive another was still reading.
const TEMP_DIR_PREFIX = "debate-transcripts-";
const SYSERON_ZIP_URL = `https://data.assemblee-nationale.fr/static/openData/repository/${LEGISLATURE}/vp/syceronbrut/syseron.xml.zip`;

interface SyncResult {
  downloaded: number;
  /** Existing séances whose text was rewritten (refresh mode). */
  refreshed: number;
  errors: string[];
}

/**
 * Source hashes avoid rewriting unchanged séances. Parser versions force a
 * reparse of existing records. `refresh` also bypasses conditional HTTP.
 */
export async function syncDebateTranscripts(opts?: { refresh?: boolean }): Promise<SyncResult> {
  const tempDir = mkdtempSync(join(tmpdir(), TEMP_DIR_PREFIX));
  try {
    return await syncFromArchive(tempDir, opts?.refresh ?? false);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function syncFromArchive(tempDir: string, refresh: boolean): Promise<SyncResult> {
  const errors: string[] = [];
  const zipPath = `${tempDir}/cr.zip`;

  const sourceKey = `debates-an:${LEGISLATURE}:parser-${DEBATE_PARSER_VERSION}`;
  const state = refresh ? null : await syncMetadata.get(sourceKey);
  let etag: string | null = null;
  let archiveHash: string | null = null;
  try {
    const download = await downloadDebateArchive(SYSERON_ZIP_URL, zipPath, state?.etag);
    if (download.notModified) return { downloaded: 0, refreshed: 0, errors: [] };
    etag = download.etag;
    archiveHash = await hashFile(zipPath);
    if (!refresh && state?.contentHash === archiveHash)
      return { downloaded: 0, refreshed: 0, errors: [] };
  } catch (e) {
    return { downloaded: 0, refreshed: 0, errors: [`Download failed: ${e}`] };
  }

  try {
    extractZip(zipPath, `${tempDir}/extracted`);
  } catch (e) {
    return { downloaded: 0, refreshed: 0, errors: [`Unzip failed: ${e}`] };
  }

  const extractDir = `${tempDir}/extracted`;
  let files: string[] = [];
  try {
    const walk = (dir: string): string[] => {
      const entries = readdirSync(dir, { withFileTypes: true });
      const results: string[] = [];
      for (const e of entries) {
        const full = `${dir}/${e.name}`;
        if (e.isDirectory()) results.push(...walk(full));
        else if (e.name.endsWith(".xml")) results.push(full);
      }
      return results;
    };
    files = walk(extractDir);
  } catch (e) {
    return { downloaded: 0, refreshed: 0, errors: [`Archive listing failed: ${e}`] };
  }
  if (files.length === 0) return { downloaded: 0, refreshed: 0, errors: ["Empty debate archive"] };

  let parsedCount = 0;
  let downloaded = 0;
  let refreshed = 0;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  // Pre-load existing seanceRefs to avoid N+1 queries
  const existingRefs = new Map(
    (
      await db.debateTranscript.findMany({
        select: { seanceRef: true, sourceHash: true, parserVersion: true },
      })
    ).map((t) => [t.seanceRef, t] as const)
  );

  for (const file of files) {
    try {
      const raw = readFileSync(file, "utf-8");
      const sourceHash = createHash("sha256").update(raw).digest("hex");
      const extracted = extractSeanceFromXml(raw);
      if (!extracted) continue;
      parsedCount++;

      const existing = existingRefs.get(extracted.seanceRef);
      if (existing) {
        if (
          !refresh &&
          existing.sourceHash === sourceHash &&
          existing.parserVersion === DEBATE_PARSER_VERSION
        )
          continue;
        const r = await db.$transaction(async (tx) => {
          const r = await tx.debateTranscript.updateMany({
            where: { seanceRef: extracted.seanceRef },
            data: {
              content: extracted.content,
              date: extracted.date,
              paragraphs: extracted.paragraphs,
              sourceHash,
              parserVersion: DEBATE_PARSER_VERSION,
              scrutinId: null,
              startTime: extracted.startTime,
              seanceOrder: extracted.seanceOrder,
              sourceUrl: extracted.sourceUrl,
            },
          });
          if (extracted.sourceUrl)
            await tx.scrutinAnalysis.deleteMany({
              where: { sourceUrl: extracted.sourceUrl, sourceType: "DEBATE_TRANSCRIPT" },
            });
          return r;
        });
        refreshed += r.count;
        continue;
      }
      if (extracted.date < cutoff) continue;

      // A séance can contain many scrutins. Its official meeting UID is the
      // join key; the legacy single-scrutin foreign key stays empty.
      await db.debateTranscript.create({
        data: {
          seanceRef: extracted.seanceRef,
          paragraphs: extracted.paragraphs,
          sourceHash,
          parserVersion: DEBATE_PARSER_VERSION,
          date: extracted.date,
          startTime: extracted.startTime,
          seanceOrder: extracted.seanceOrder,
          content: extracted.content,
          sourceUrl: extracted.sourceUrl,
        },
      });
      existingRefs.set(extracted.seanceRef, {
        seanceRef: extracted.seanceRef,
        sourceHash,
        parserVersion: DEBATE_PARSER_VERSION,
      });
      downloaded++;
    } catch (e) {
      errors.push(`Error processing ${file}: ${e}`);
    }
  }

  if (parsedCount === 0) errors.push("No readable séance in debate archive");
  if (errors.length === 0) {
    await syncMetadata.markCompleted(sourceKey, {
      etag,
      contentHash: archiveHash,
      itemCount: downloaded + refreshed,
    });
  }
  return { downloaded, refreshed, errors: errors.slice(0, 10) };
}
