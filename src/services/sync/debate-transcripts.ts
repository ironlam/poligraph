import { db } from "@/lib/db";
import * as https from "https";
import { mkdtempSync, rmSync, readdirSync, readFileSync, createWriteStream } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { extractZip } from "@/lib/parsing/unzip";
import { extractSeanceFromXml } from "./debate-transcript-parse";

const LEGISLATURE = 17;
// Each run extracts into its own directory: a fixed path let one run delete the
// archive another was still reading.
const TEMP_DIR_PREFIX = "debate-transcripts-";
const SYSERON_ZIP_URL = `https://data.assemblee-nationale.fr/static/openData/repository/${LEGISLATURE}/vp/syceronbrut/syseron.xml.zip`;

interface SyncResult {
  downloaded: number;
  errors: string[];
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    https
      .get(url, (resp) => {
        if (resp.statusCode === 301 || resp.statusCode === 302) {
          const location = resp.headers.location;
          if (location) {
            downloadFile(location, dest).then(resolve).catch(reject);
            return;
          }
        }
        resp.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", reject);
  });
}

export async function syncDebateTranscripts(): Promise<SyncResult> {
  const tempDir = mkdtempSync(join(tmpdir(), TEMP_DIR_PREFIX));
  try {
    return await syncFromArchive(tempDir);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function syncFromArchive(tempDir: string): Promise<SyncResult> {
  const errors: string[] = [];
  const zipPath = `${tempDir}/cr.zip`;

  try {
    await downloadFile(SYSERON_ZIP_URL, zipPath);
  } catch (e) {
    return { downloaded: 0, errors: [`Download failed: ${e}`] };
  }

  try {
    extractZip(zipPath, `${tempDir}/extracted`);
  } catch (e) {
    return { downloaded: 0, errors: [`Unzip failed: ${e}`] };
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
  } catch {
    // ignore
  }

  let downloaded = 0;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  // Pre-load existing seanceRefs to avoid N+1 queries
  const existingRefs = new Set(
    (
      await db.debateTranscript.findMany({
        select: { seanceRef: true },
      })
    ).map((t) => t.seanceRef)
  );

  for (const file of files) {
    try {
      const raw = readFileSync(file, "utf-8");
      const extracted = extractSeanceFromXml(raw);
      if (!extracted) continue;

      if (extracted.date < cutoff) continue;
      if (existingRefs.has(extracted.seanceRef)) continue;

      // Store the FULL séance text (no truncation) plus the metadata needed for
      // séance-scoped matching: start time and sitting order in the day.
      //
      // We deliberately DO NOT set scrutinId here. The old "first scrutin of the
      // day" linkage was wrong (it attached a séance to an arbitrary same-day
      // scrutin). A reliable séance↔scrutin link is computed read-only by the
      // resolver/audit (scrutin-substance) and will be wired in a later PR; until
      // then new transcripts stay unlinked rather than carry a false link.
      await db.debateTranscript.create({
        data: {
          seanceRef: extracted.seanceRef,
          date: extracted.date,
          startTime: extracted.startTime,
          seanceOrder: extracted.seanceOrder,
          content: extracted.content,
          sourceUrl: extracted.sourceUrl,
        },
      });
      existingRefs.add(extracted.seanceRef);
      downloaded++;
    } catch (e) {
      errors.push(`Error processing ${file}: ${e}`);
    }
  }

  return { downloaded, errors: errors.slice(0, 10) };
}
