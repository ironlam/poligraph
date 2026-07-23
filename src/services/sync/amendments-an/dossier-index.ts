import crypto from "node:crypto";
import yauzl from "yauzl";
import { dossierRefFromEntryPath } from "./zip-iterator";

export interface CentralDirectoryScan {
  /** sha1-hex content signature per dossier ref (order-independent). */
  signatures: Map<string, string>;
  /** Total `.json` entries enumerated (used for the fail-loud safety cap). */
  entriesInspected: number;
}

/**
 * Reads ONLY the ZIP central directory (no decompression) and derives a
 * deterministic content signature per dossier ref.
 *
 * yauzl parses the whole central directory at open time; enumerating entries
 * with `readEntry()` (and never calling `openReadStream`) exposes each entry's
 * `fileName`, `crc32` and `uncompressedSize` without inflating any bytes. This
 * stays cheap even on the ~283 MB / ~123k-entry AN feed.
 *
 * Per dossier we collect `fileName:crc32:uncompressedSize` for each of its
 * `.json` entries, sort them (so ZIP entry order does not matter), join and
 * sha1-hash. crc32 and uncompressedSize are both functions of the uncompressed
 * content, so two runs of the same feed produce identical signatures and any
 * changed entry changes exactly its dossier's signature.
 */
export async function scanCentralDirectory(zipPath: string): Promise<CentralDirectoryScan> {
  const perDossier = new Map<string, string[]>();
  let entriesInspected = 0;

  const zipfile = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: false }, (err, zf) => {
      if (err || !zf) return reject(err ?? new Error("yauzl: no zipfile"));
      resolve(zf);
    });
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const onEntry = (entry: yauzl.Entry) => {
        const name = entry.fileName;
        // Skip directory records; only .json entries carry amendment content.
        if (!name.endsWith("/") && name.endsWith(".json")) {
          entriesInspected++;
          const ref = dossierRefFromEntryPath(name);
          if (ref) {
            const parts = perDossier.get(ref) ?? [];
            parts.push(`${name}:${entry.crc32}:${entry.uncompressedSize}`);
            perDossier.set(ref, parts);
          }
        }
        zipfile.readEntry();
      };
      zipfile.on("entry", onEntry);
      zipfile.on("end", () => resolve());
      zipfile.on("error", reject);
      zipfile.readEntry();
    });
  } finally {
    zipfile.close();
  }

  const signatures = new Map<string, string>();
  for (const [ref, parts] of perDossier) {
    parts.sort();
    signatures.set(ref, crypto.createHash("sha1").update(parts.join("\n")).digest("hex"));
  }
  return { signatures, entriesInspected };
}

/**
 * Public API: per-dossier content signatures from the ZIP central directory.
 * Thin wrapper over {@link scanCentralDirectory} for callers that only need the
 * signature map (the incremental diff and its tests).
 */
export async function readDossierSignatures(zipPath: string): Promise<Map<string, string>> {
  return (await scanCentralDirectory(zipPath)).signatures;
}
