import yauzl from "yauzl";
import { safeJsonParseOrThrow } from "@/lib/api/safe-json";

export interface ZipJsonEntry {
  entryPath: string;
  json: unknown;
}

export interface ZipEntryWarning {
  entryPath: string;
  error: string;
}

export interface IterateOptions {
  limit?: number;
  /** Called for entries that cannot be parsed; the iterator never silently drops data. */
  onWarning?: (w: ZipEntryWarning) => void;
  /**
   * Pure predicate evaluated on the entry path BEFORE any decompression. When it
   * returns false the entry is skipped without inflating its bytes — this is what
   * lets the incremental ingest avoid parsing unchanged dossiers.
   */
  entryFilter?: (entryPath: string) => boolean;
}

/**
 * Streams .json entries from a ZIP one at a time using yauzl. Only one entry's
 * bytes are buffered at a time — the archive is never fully extracted to memory
 * or disk. Suitable for the ~272 MB / 111k-file AN amendments feed.
 *
 * Unparseable JSON entries DO NOT pass through silently: when `onWarning` is
 * provided the iterator invokes it (entry path + error) and continues; when it
 * is NOT provided the iterator throws. Either way the orchestrator can account
 * for every entry seen.
 */
export async function* iterateZipJsonEntries(
  zipPath: string,
  opts: IterateOptions = {}
): AsyncGenerator<ZipJsonEntry> {
  const zipfile = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: false }, (err, zf) => {
      if (err || !zf) return reject(err ?? new Error("yauzl: no zipfile"));
      resolve(zf);
    });
  });

  let yielded = 0;
  try {
    while (true) {
      if (opts.limit !== undefined && yielded >= opts.limit) break;

      const entry = await new Promise<yauzl.Entry | null>((resolve, reject) => {
        const onEntry = (e: yauzl.Entry) => {
          cleanup();
          resolve(e);
        };
        const onEnd = () => {
          cleanup();
          resolve(null);
        };
        const onErr = (e: Error) => {
          cleanup();
          reject(e);
        };
        const cleanup = () => {
          zipfile.removeListener("entry", onEntry);
          zipfile.removeListener("end", onEnd);
          zipfile.removeListener("error", onErr);
        };
        zipfile.once("entry", onEntry);
        zipfile.once("end", onEnd);
        zipfile.once("error", onErr);
        zipfile.readEntry();
      });

      if (entry === null) break;
      if (entry.fileName.endsWith("/") || !entry.fileName.endsWith(".json")) continue;
      // Skip filtered entries before opening a read stream: no decompression cost.
      if (opts.entryFilter && !opts.entryFilter(entry.fileName)) continue;

      const buf = await new Promise<Buffer>((resolve, reject) => {
        zipfile.openReadStream(entry, (err, stream) => {
          if (err || !stream) return reject(err ?? new Error("no stream"));
          const chunks: Buffer[] = [];
          stream.on("data", (c) => chunks.push(c as Buffer));
          stream.on("end", () => resolve(Buffer.concat(chunks)));
          stream.on("error", reject);
        });
      });

      let json: unknown;
      try {
        json = safeJsonParseOrThrow(buf.toString("utf8"));
      } catch (e) {
        const msg = (e as Error).message ?? String(e);
        if (opts.onWarning) {
          opts.onWarning({ entryPath: entry.fileName, error: msg });
          continue;
        }
        throw new Error(`Unparseable JSON in ${entry.fileName}: ${msg}`);
      }

      yielded++;
      yield { entryPath: entry.fileName, json };
    }
  } finally {
    zipfile.close();
  }
}

/** Extracts the AN dossier ref (DLR…) from an entry path, or null. */
export function dossierRefFromEntryPath(entryPath: string): string | null {
  const m = entryPath.match(/\/(DLR[0-9A-Z]+)\//);
  return m?.[1] ?? null;
}

/** Extracts the AN texte/bill ref (PIONANR…) from an entry path, or null.
 *  Used as a fallback when the JSON's `texteLegislatifRef` is nil/absent. */
export function texteRefFromEntryPath(entryPath: string): string | null {
  const m = entryPath.match(/\/(PIONANR[0-9A-Z]+)\//);
  return m?.[1] ?? null;
}
