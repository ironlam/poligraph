// @vitest-environment node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  download: vi.fn(),
  extractZip: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  get: vi.fn(),
  completed: vi.fn(),
  parse: vi.fn(),
}));
vi.mock("../debate-transcript-download", () => ({ downloadDebateArchive: h.download }));
vi.mock("@/lib/sync/hash", () => ({ hashFile: vi.fn(async () => "zip-hash") }));
vi.mock("@/lib/parsing/unzip", () => ({ extractZip: h.extractZip }));
vi.mock("@/lib/sync/sync-metadata", () => ({
  syncMetadata: { get: h.get, markCompleted: h.completed },
}));
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        debateTranscript: { updateMany: h.updateMany },
        scrutinAnalysis: { deleteMany: vi.fn() },
      }),
    debateTranscript: { findMany: h.findMany, create: h.create, updateMany: h.updateMany },
  },
}));
vi.mock("../debate-transcript-parse", () => ({
  DEBATE_PARSER_VERSION: 2,
  extractSeanceFromXml: h.parse,
}));
import { syncDebateTranscripts } from "../debate-transcripts";
const seance = {
  seanceRef: "RU1",
  date: new Date(),
  startTime: null,
  seanceOrder: 1,
  content: "An actual speech",
  paragraphs: [],
  sourceUrl: "https://www.assemblee-nationale.fr/source",
};
beforeEach(() => {
  vi.resetAllMocks();
  h.get.mockResolvedValue(null);
  h.download.mockResolvedValue({ notModified: false, etag: "etag" });
  h.findMany.mockResolvedValue([]);
  h.parse.mockReturnValue(seance);
  h.updateMany.mockResolvedValue({ count: 1 });
  h.extractZip.mockImplementation((_zip: string, dest: string) => {
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, "seance.xml"), "<xml>source</xml>");
  });
});
describe("debate ingestion", () => {
  it("isolates concurrent runs and cleans both directories", async () => {
    await Promise.all([syncDebateTranscripts(), syncDebateTranscripts()]);
    const dirs = h.extractZip.mock.calls.map((c) => dirname(c[1]));
    expect(new Set(dirs).size).toBe(2);
    for (const dir of dirs) expect(existsSync(dir)).toBe(false);
  });
  it("reports unzip failure, cleans up and never advances the HTTP cursor", async () => {
    let dir = "";
    h.extractZip.mockImplementation((_zip: string, dest: string) => {
      dir = dirname(dest);
      throw Error("corrupt");
    });
    expect((await syncDebateTranscripts()).errors[0]).toContain("Unzip failed");
    expect(existsSync(dir)).toBe(false);
    expect(h.completed).not.toHaveBeenCalled();
  });
  it("does no database scan or XML work after 304", async () => {
    h.download.mockResolvedValue({ notModified: true, etag: "etag" });
    await syncDebateTranscripts();
    expect(h.findMany).not.toHaveBeenCalled();
    expect(h.extractZip).not.toHaveBeenCalled();
  });
  it("refreshes existing legacy text and removes its arbitrary scrutin linkage", async () => {
    h.findMany.mockResolvedValue([{ seanceRef: "RU1", sourceHash: null, parserVersion: null }]);
    expect((await syncDebateTranscripts()).refreshed).toBe(1);
    expect(h.updateMany.mock.calls[0]![0].data).toMatchObject({
      scrutinId: null,
      parserVersion: 2,
      content: seance.content,
    });
  });
  it("does not rewrite unchanged source content", async () => {
    await syncDebateTranscripts();
    const data = h.create.mock.calls[0]![0].data;
    h.findMany.mockResolvedValue([
      { seanceRef: "RU1", sourceHash: data.sourceHash, parserVersion: 2 },
    ]);
    await syncDebateTranscripts();
    expect(h.updateMany).not.toHaveBeenCalled();
  });
  it("reports an empty archive as a failure", async () => {
    h.extractZip.mockImplementation((_zip: string, dest: string) =>
      mkdirSync(dest, { recursive: true })
    );
    expect((await syncDebateTranscripts()).errors).not.toHaveLength(0);
    expect(h.completed).not.toHaveBeenCalled();
  });
});
