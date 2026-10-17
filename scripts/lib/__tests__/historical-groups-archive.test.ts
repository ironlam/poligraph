// @vitest-environment node
import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";
import {
  ArchiveIntegrityError,
  DEFAULT_LIMITS,
  openArchiveBytes,
  type ArchiveErrorCode,
} from "../historical-groups-archive";

function zipOf(files: Record<string, string | Buffer>, attrs: Record<string, number> = {}): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) {
    zip.addFile(name, Buffer.isBuffer(content) ? content : Buffer.from(content));
    const attr = attrs[name];
    // `addFile` mangles its attribute argument, the entry property is the one that is honoured.
    if (attr !== undefined) (zip.getEntry(name) as AdmZip.IZipEntry).attr = attr;
  }
  return zip.toBuffer();
}

/**
 * An archive holding one file under a hostile name. The library cleans names when it writes them
 * (`../a` becomes `a`), so the name is patched into the bytes, local header and central directory,
 * after writing a placeholder of the same length.
 */
function zipWithRawName(rawName: string): Buffer {
  const placeholder = "x".repeat(Buffer.byteLength(rawName));
  const bytes = Buffer.from(zipOf({ [placeholder]: "{}" }));
  const needle = Buffer.from(placeholder);
  const replacement = Buffer.from(rawName);
  for (let at = bytes.indexOf(needle); at !== -1; at = bytes.indexOf(needle, at + 1)) {
    replacement.copy(bytes, at);
  }
  return bytes;
}

function codeOf(run: () => unknown): ArchiveErrorCode {
  try {
    run();
  } catch (error) {
    if (error instanceof ArchiveIntegrityError) return error.code;
    throw error;
  }
  throw new Error("expected the archive to be refused");
}

const drain = (archive: ReturnType<typeof openArchiveBytes>) => [...archive.entries()];

describe("openArchiveBytes: a sound archive", () => {
  it("lists entries by folder, fingerprints the bytes and reads every file", () => {
    const bytes = zipOf({ "json/a.json": "{}", "json/b.json": '{"x":1}', "json/sub/c.json": "[]" });
    const archive = openArchiveBytes(bytes);
    expect(archive.sizeBytes).toBe(bytes.length);
    expect(archive.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(archive.entryCount).toBe(3);
    expect(archive.entriesByFolder).toEqual({ json: 2, "json/sub": 1 });
    expect(drain(archive).map((e) => [e.name, e.data.toString()])).toEqual([
      ["json/a.json", "{}"],
      ["json/b.json", '{"x":1}'],
      ["json/sub/c.json", "[]"],
    ]);
  });

  it("gives the same fingerprint to the same bytes and another to other bytes", () => {
    const a = openArchiveBytes(zipOf({ "json/a.json": "{}" }));
    const b = openArchiveBytes(zipOf({ "json/a.json": "{}" }));
    const c = openArchiveBytes(zipOf({ "json/a.json": "[]" }));
    expect(a.sha256).toBe(b.sha256);
    expect(a.sha256).not.toBe(c.sha256);
  });

  it("does not write anything: it has no output directory to escape from", () => {
    const archive = openArchiveBytes(zipOf({ "json/a.json": "{}" }));
    expect(Object.keys(archive).sort()).toEqual([
      "entries",
      "entriesByFolder",
      "entryCount",
      "sha256",
      "sizeBytes",
    ]);
  });
});

describe("openArchiveBytes: what is refused, with an explicit code", () => {
  it.each([
    ["a parent directory", "../evil.json"],
    ["a nested parent directory", "json/../../evil.json"],
    ["an absolute path", "/etc/evil.json"],
    ["a drive letter", "C:/evil.json"],
    ["a backslash", "json\\evil.json"],
    ["a dot segment", "json/./a.json"],
    ["a double slash", "json//a.json"],
  ])("refuses an entry name with %s", (_label, name) => {
    expect(codeOf(() => openArchiveBytes(zipWithRawName(name)))).toBe("ENTRY_NAME_REFUSED");
  });

  it("refuses a symbolic link", () => {
    const bytes = zipOf({ "json/link": "/etc/passwd" }, { "json/link": (0o120777 << 16) >>> 0 });
    expect(codeOf(() => openArchiveBytes(bytes))).toBe("ENTRY_SYMLINK");
  });

  it("refuses two entries with the same name, which the library would otherwise merge silently", () => {
    const bytes = Buffer.from(zipOf({ "json/a.json": "{}", "json/b.json": "{}" }));
    // The central directory copy of `b` is the last occurrence of its name. Renamed to `a`, the
    // library lists one entry where the directory declares two.
    Buffer.from("json/a.json").copy(bytes, bytes.lastIndexOf(Buffer.from("json/b.json")));
    expect(codeOf(() => openArchiveBytes(bytes))).toBe("ENTRY_DUPLICATE");
  });

  it("refuses an archive whose central directory declares more entries than the library lists", () => {
    const bytes = Buffer.from(zipOf({ "json/a.json": "{}" }));
    const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    bytes.writeUInt16LE(2, end + 10);
    expect(codeOf(() => openArchiveBytes(bytes))).toBe("ENTRY_DUPLICATE");
  });

  it("refuses more entries than the limit", () => {
    const bytes = zipOf({ "json/a.json": "{}", "json/b.json": "{}", "json/c.json": "{}" });
    expect(codeOf(() => openArchiveBytes(bytes, { ...DEFAULT_LIMITS, maxEntries: 2 }))).toBe(
      "TOO_MANY_ENTRIES"
    );
  });

  it("refuses an entry larger than the limit and a total larger than the limit", () => {
    const bytes = zipOf({ "json/a.json": "x".repeat(600), "json/b.json": "y".repeat(600) });
    expect(codeOf(() => openArchiveBytes(bytes, { ...DEFAULT_LIMITS, maxEntryBytes: 500 }))).toBe(
      "ENTRY_TOO_LARGE"
    );
    expect(codeOf(() => openArchiveBytes(bytes, { ...DEFAULT_LIMITS, maxTotalBytes: 1000 }))).toBe(
      "TOTAL_TOO_LARGE"
    );
  });

  it("refuses an archive larger than the limit before reading it", () => {
    const bytes = zipOf({ "json/a.json": "{}" });
    expect(codeOf(() => openArchiveBytes(bytes, { ...DEFAULT_LIMITS, maxArchiveBytes: 10 }))).toBe(
      "ARCHIVE_TOO_LARGE"
    );
  });

  it("refuses a compression ratio that looks like a bomb", () => {
    const bytes = zipOf({ "json/a.json": Buffer.alloc(1_000_000, 0) });
    expect(codeOf(() => openArchiveBytes(bytes))).toBe("COMPRESSION_RATIO");
  });

  it("refuses bytes that are not an archive, and a truncated archive", () => {
    expect(codeOf(() => openArchiveBytes(Buffer.from("not a zip")))).toBe("ARCHIVE_UNREADABLE");
    const bytes = zipOf({ "json/a.json": "{}".repeat(500) });
    expect(codeOf(() => openArchiveBytes(bytes.subarray(0, bytes.length - 30)))).toBe(
      "ARCHIVE_UNREADABLE"
    );
  });

  it("refuses an entry that inflates beyond the size its header declares, when it is read", () => {
    const bytes = Buffer.from(zipOf({ "json/a.json": "x".repeat(5000) }));
    const central = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    bytes.writeUInt32LE(10, central + 24);
    const archive = openArchiveBytes(bytes);
    expect(codeOf(() => drain(archive))).toBe("ENTRY_CORRUPT");
  });

  it("refuses an entry whose data is corrupt, when it is read", () => {
    const content = Array.from({ length: 400 }, (_, i) => `line ${i} ${Math.sin(i)}`).join("\n");
    const bytes = Buffer.from(zipOf({ "json/a.json": content }));
    const start = bytes.indexOf(Buffer.from("PK\x03\x04")) + 30 + "json/a.json".length;
    bytes[start + 20] = (bytes[start + 20] ?? 0) ^ 0xff;
    bytes[start + 21] = (bytes[start + 21] ?? 0) ^ 0xff;
    const archive = openArchiveBytes(bytes);
    expect(codeOf(() => drain(archive))).toBe("ENTRY_CORRUPT");
  });
});
