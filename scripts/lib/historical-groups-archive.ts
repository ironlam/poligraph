/**
 * Reading of the official archives for the historical group validation (lot 5, phase 5A-2).
 *
 * The archives are untrusted data. Nothing is extracted to disk: entries are read in memory, one at
 * a time, so there is no output path to escape from. The checks below are still made, because an
 * archive that tries to leave its folder is not an archive to process: names that are absolute,
 * contain `..`, a backslash or a NUL, symbolic links, duplicate names, and sizes beyond the limits.
 * Any of them stops the run with an explicit error. Nothing is skipped quietly.
 *
 * No network, no database, no secret, no environment variable.
 */
import AdmZip from "adm-zip";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface ArchiveLimits {
  maxArchiveBytes: number;
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
  /** Declared uncompressed size over compressed size, per entry. */
  maxCompressionRatio: number;
}

/** Sized for the official archives (largest entry 0.4 MB, 14 053 entries, 180 MB unpacked). */
export const DEFAULT_LIMITS: ArchiveLimits = {
  maxArchiveBytes: 256 * 1024 * 1024,
  maxEntries: 50_000,
  maxEntryBytes: 8 * 1024 * 1024,
  maxTotalBytes: 1024 * 1024 * 1024,
  maxCompressionRatio: 200,
};

export const ARCHIVE_ERROR_CODES = [
  "ARCHIVE_TOO_LARGE",
  "ARCHIVE_UNREADABLE",
  "TOO_MANY_ENTRIES",
  "ENTRY_NAME_REFUSED",
  "ENTRY_DUPLICATE",
  "ENTRY_SYMLINK",
  "ENTRY_TOO_LARGE",
  "TOTAL_TOO_LARGE",
  "COMPRESSION_RATIO",
  "ENTRY_CORRUPT",
] as const;
export type ArchiveErrorCode = (typeof ARCHIVE_ERROR_CODES)[number];

export class ArchiveIntegrityError extends Error {
  constructor(
    readonly code: ArchiveErrorCode,
    detail: string
  ) {
    super(`${code}: ${detail}`);
    this.name = "ArchiveIntegrityError";
  }
}

export interface ArchiveEntry {
  name: string;
  data: Buffer;
}

export interface OpenedArchive {
  sizeBytes: number;
  sha256: string;
  /** Number of file entries by folder (`json/acteur`, `json`, ...). Directories are not counted. */
  entriesByFolder: Record<string, number>;
  entryCount: number;
  entries: () => Generator<ArchiveEntry>;
}

const UNIX_FILE_TYPE_MASK = 0o170000;
const UNIX_SYMLINK = 0o120000;

function refuseName(name: string): boolean {
  if (name === "" || name.includes("\0") || name.includes("\\") || name.startsWith("/"))
    return true;
  if (/^[A-Za-z]:/.test(name)) return true;
  const normalized = path.posix.normalize(name);
  return (
    normalized === ".." || normalized.startsWith("../") || normalized !== name.replace(/\/+$/, "")
  );
}

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;

/** Total entries declared by the end-of-central-directory record, `null` when it is unreadable. */
function declaredEntryCount(bytes: Buffer): number | null {
  const lowest = Math.max(0, bytes.length - 22 - 0xffff);
  for (let i = bytes.length - 22; i >= lowest; i -= 1) {
    if (bytes.readUInt32LE(i) === END_OF_CENTRAL_DIRECTORY) {
      const total = bytes.readUInt16LE(i + 10);
      // 0xffff means "see the zip64 record": beyond what these archives hold and what is accepted.
      return total === 0xffff ? null : total;
    }
  }
  return null;
}

/** Opens an archive from bytes. Every check that does not need the file contents is made here. */
export function openArchiveBytes(
  bytes: Buffer,
  limits: ArchiveLimits = DEFAULT_LIMITS
): OpenedArchive {
  if (bytes.length > limits.maxArchiveBytes) {
    throw new ArchiveIntegrityError("ARCHIVE_TOO_LARGE", `${bytes.length} bytes`);
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  let headers: AdmZip.IZipEntry[];
  try {
    // The library reads the central directory lazily: a damaged one only fails at `getEntries`.
    headers = new AdmZip(bytes).getEntries();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    throw new ArchiveIntegrityError(
      /duplicate entry/i.test(message) ? "ENTRY_DUPLICATE" : "ARCHIVE_UNREADABLE",
      message
    );
  }
  if (headers.length > limits.maxEntries) {
    throw new ArchiveIntegrityError("TOO_MANY_ENTRIES", `${headers.length} entries`);
  }
  // The library keeps one entry per name, so a duplicated name would simply vanish. The central
  // directory says how many entries it holds: if the library lists fewer, something was hidden.
  const declared = declaredEntryCount(bytes);
  if (declared === null || declared !== headers.length) {
    throw new ArchiveIntegrityError(
      "ENTRY_DUPLICATE",
      `central directory declares ${declared ?? "an unreadable number of"} entries, ${headers.length} listed`
    );
  }

  const seen = new Set<string>();
  const files: AdmZip.IZipEntry[] = [];
  const entriesByFolder: Record<string, number> = {};
  let declaredTotal = 0;
  for (const header of headers) {
    // `entryName` is already sanitized by the library (`../a` becomes `a`): only the raw name tells
    // what the archive really contains.
    const name = header.rawEntryName.toString("utf8");
    if (refuseName(name))
      throw new ArchiveIntegrityError("ENTRY_NAME_REFUSED", JSON.stringify(name));
    if (seen.has(name)) throw new ArchiveIntegrityError("ENTRY_DUPLICATE", JSON.stringify(name));
    seen.add(name);
    if (((header.attr >>> 16) & UNIX_FILE_TYPE_MASK) === UNIX_SYMLINK) {
      throw new ArchiveIntegrityError("ENTRY_SYMLINK", JSON.stringify(name));
    }
    if (header.isDirectory) continue;
    const size = header.header.size;
    if (size > limits.maxEntryBytes) {
      throw new ArchiveIntegrityError(
        "ENTRY_TOO_LARGE",
        `${JSON.stringify(name)} declares ${size} bytes`
      );
    }
    declaredTotal += size;
    if (declaredTotal > limits.maxTotalBytes) {
      throw new ArchiveIntegrityError("TOTAL_TOO_LARGE", `${declaredTotal} bytes declared`);
    }
    const compressed = header.header.compressedSize;
    if (size > 0 && (compressed === 0 || size / compressed > limits.maxCompressionRatio)) {
      throw new ArchiveIntegrityError("COMPRESSION_RATIO", JSON.stringify(name));
    }
    const folder = path.posix.dirname(name);
    entriesByFolder[folder] = (entriesByFolder[folder] ?? 0) + 1;
    files.push(header);
  }

  return {
    sizeBytes: bytes.length,
    sha256,
    entriesByFolder: Object.fromEntries(
      Object.entries(entriesByFolder).sort(([a], [b]) => (a < b ? -1 : 1))
    ),
    entryCount: files.length,
    *entries() {
      for (const header of files) {
        // The library refuses data that does not match the size the header declares, and the declared
        // sizes were bounded when the archive was opened: a bomb fails here, as `ENTRY_CORRUPT`.
        let data: Buffer;
        try {
          data = header.getData();
        } catch (error) {
          throw new ArchiveIntegrityError(
            "ENTRY_CORRUPT",
            `${JSON.stringify(header.rawEntryName.toString("utf8"))}: ${error instanceof Error ? error.message : "unknown"}`
          );
        }
        yield { name: header.rawEntryName.toString("utf8"), data };
      }
    },
  };
}

/** Opens an archive from a path given by the operator. Reads the file, never writes anything. */
export function openArchiveFile(
  filePath: string,
  limits: ArchiveLimits = DEFAULT_LIMITS
): OpenedArchive {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new ArchiveIntegrityError("ARCHIVE_UNREADABLE", "not a regular file");
  if (stat.size > limits.maxArchiveBytes) {
    throw new ArchiveIntegrityError("ARCHIVE_TOO_LARGE", `${stat.size} bytes`);
  }
  return openArchiveBytes(fs.readFileSync(filePath), limits);
}
