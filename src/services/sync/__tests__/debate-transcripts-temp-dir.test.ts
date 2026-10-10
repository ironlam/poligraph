import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { Readable } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  get: vi.fn(),
  extractZip: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("https", () => ({ get: h.get }));
vi.mock("@/lib/parsing/unzip", () => ({ extractZip: h.extractZip }));
vi.mock("@/lib/db", () => ({
  db: { debateTranscript: { findMany: h.findMany, create: vi.fn() } },
}));
vi.mock("@/services/sync/debate-transcript-parse", () => ({ extractSeanceFromXml: () => null }));

import { syncDebateTranscripts } from "@/services/sync/debate-transcripts";

function serveArchive() {
  h.get.mockImplementation((_url: string, callback: (response: Readable) => void) => {
    const response = Object.assign(Readable.from([Buffer.from("not-a-real-zip")]), {
      statusCode: 200,
      headers: {},
    });
    callback(response);
    return { on: vi.fn().mockReturnThis() };
  });
}

describe("syncDebateTranscripts temp directory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serveArchive();
    h.findMany.mockResolvedValue([]);
    h.extractZip.mockImplementation((_zip: string, destination: string) => {
      mkdirSync(destination, { recursive: true });
      writeFileSync(join(destination, "seance.xml"), "<x/>");
    });
  });

  // A fixed /tmp path let one run delete the archive another was still reading.
  it("extracts each run into its own directory and removes it", async () => {
    await Promise.all([syncDebateTranscripts(), syncDebateTranscripts()]);
    const runDirs = h.extractZip.mock.calls.map((call) => dirname(call[1] as string));
    expect(new Set(runDirs).size).toBe(2);
    for (const dir of runDirs) expect(existsSync(dir)).toBe(false);
  });

  it("removes its directory when the archive cannot be extracted", async () => {
    let runDir = "";
    h.extractZip.mockImplementation((_zip: string, destination: string) => {
      runDir = dirname(destination);
      throw new Error("corrupt archive");
    });
    const result = await syncDebateTranscripts();
    expect(result.errors[0]).toContain("Unzip failed");
    expect(runDir).not.toBe("");
    expect(existsSync(runDir)).toBe(false);
  });
});
