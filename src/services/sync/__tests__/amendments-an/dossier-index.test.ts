import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import os from "os";
import path from "path";
import yazl from "yazl";
import {
  readDossierSignatures,
  scanCentralDirectory,
} from "@/services/sync/amendments-an/dossier-index";

/** Writes a ZIP from [entryPath, content] pairs, added in the given order. */
async function buildZip(dir: string, name: string, entries: [string, string][]): Promise<string> {
  const zp = path.join(dir, name);
  const zf = new yazl.ZipFile();
  for (const [entryPath, content] of entries) zf.addBuffer(Buffer.from(content), entryPath);
  zf.end();
  await new Promise<void>((resolve, reject) => {
    const chunks: Buffer[] = [];
    zf.outputStream.on("data", (c) => chunks.push(c as Buffer));
    zf.outputStream.on("end", () => {
      writeFileSync(zp, Buffer.concat(chunks));
      resolve();
    });
    zf.outputStream.on("error", reject);
  });
  return zp;
}

describe("readDossierSignatures", () => {
  let tmp: string;

  const setup = () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), "dossier-sig-"));
    return tmp;
  };
  const teardown = () => rmSync(tmp, { recursive: true, force: true });

  const DA = "DLR5L17N54083";
  const DB = "DLR5L17N54084";
  const ENTRIES: [string, string][] = [
    [`json/${DA}/PIONANR5L17B1432/a1.json`, '{"amendement":{"uid":"A1"}}'],
    [`json/${DA}/PIONANR5L17B1432/a2.json`, '{"amendement":{"uid":"A2"}}'],
    [`json/${DB}/PIONANR5L17B1500/b1.json`, '{"amendement":{"uid":"B1"}}'],
  ];

  it("produces identical signatures for identical content across two ZIPs", async () => {
    const dir = setup();
    try {
      const z1 = await buildZip(dir, "one.zip", ENTRIES);
      const z2 = await buildZip(dir, "two.zip", ENTRIES);
      const s1 = await readDossierSignatures(z1);
      const s2 = await readDossierSignatures(z2);
      expect([...s1.keys()].sort()).toEqual([DA, DB]);
      expect(s1.get(DA)).toBe(s2.get(DA));
      expect(s1.get(DB)).toBe(s2.get(DB));
    } finally {
      teardown();
    }
  });

  it("changes only the affected dossier's signature when one entry's content changes", async () => {
    const dir = setup();
    try {
      const baseline = await readDossierSignatures(await buildZip(dir, "base.zip", ENTRIES));
      const mutated: [string, string][] = [
        [`json/${DA}/PIONANR5L17B1432/a1.json`, '{"amendement":{"uid":"A1","v":2}}'], // changed
        [`json/${DA}/PIONANR5L17B1432/a2.json`, '{"amendement":{"uid":"A2"}}'],
        [`json/${DB}/PIONANR5L17B1500/b1.json`, '{"amendement":{"uid":"B1"}}'],
      ];
      const after = await readDossierSignatures(await buildZip(dir, "mut.zip", mutated));
      expect(after.get(DA)).not.toBe(baseline.get(DA));
      expect(after.get(DB)).toBe(baseline.get(DB)); // untouched dossier stable
    } finally {
      teardown();
    }
  });

  it("is independent of ZIP entry order (shuffled entries -> same signatures)", async () => {
    const dir = setup();
    try {
      const ordered = await readDossierSignatures(await buildZip(dir, "ord.zip", ENTRIES));
      const shuffled: [string, string][] = [ENTRIES[2]!, ENTRIES[0]!, ENTRIES[1]!];
      const scrambled = await readDossierSignatures(await buildZip(dir, "shuf.zip", shuffled));
      expect(scrambled.get(DA)).toBe(ordered.get(DA));
      expect(scrambled.get(DB)).toBe(ordered.get(DB));
    } finally {
      teardown();
    }
  });

  it("ignores non-.json entries and entries with no dossier ref", async () => {
    const dir = setup();
    try {
      const mixed: [string, string][] = [
        [`json/${DA}/PIONANR5L17B1432/a1.json`, '{"amendement":{"uid":"A1"}}'],
        [`json/${DA}/PIONANR5L17B1432/readme.txt`, "not json"],
        ["json/no-dossier/x.json", "{}"], // no DLR segment -> no dossier ref
      ];
      const sigs = await readDossierSignatures(await buildZip(dir, "mixed.zip", mixed));
      expect([...sigs.keys()]).toEqual([DA]);
    } finally {
      teardown();
    }
  });

  it("scanCentralDirectory counts every .json entry (safety-cap basis)", async () => {
    const dir = setup();
    try {
      const withNoise: [string, string][] = [
        ...ENTRIES,
        [`json/${DA}/PIONANR5L17B1432/note.txt`, "skip me"], // not .json -> not counted
      ];
      const scan = await scanCentralDirectory(await buildZip(dir, "count.zip", withNoise));
      expect(scan.entriesInspected).toBe(3);
      expect(scan.signatures.size).toBe(2);
    } finally {
      teardown();
    }
  });
});
