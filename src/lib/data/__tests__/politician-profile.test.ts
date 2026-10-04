import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

const { findFirst, build, readDatabaseNow, write, captureMessage, captureException } = vi.hoisted(
  () => ({
    findFirst: vi.fn(),
    build: vi.fn(),
    readDatabaseNow: vi.fn(),
    write: vi.fn(),
    captureMessage: vi.fn(),
    captureException: vi.fn(),
  })
);
vi.mock("@/lib/db", () => ({ db: { politicianProfileSnapshot: { findFirst } } }));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/politicians/profile-snapshot/build", () => ({
  buildPoliticianProfileDocument: build,
}));
vi.mock("@/lib/politicians/profile-snapshot/store", () => ({
  readDatabaseNow,
  writeProfileSnapshot: write,
}));
vi.mock("@sentry/nextjs", () => ({ captureMessage, captureException }));

import { readProfileSnapshot } from "../politician-profile";
import type { PoliticianProfileDocument } from "@/lib/politicians/profile-snapshot/document";

const doc = { identity: { id: "pol-1", slug: "slug-test" } } as PoliticianProfileDocument;
const DB_NOW = new Date("2026-10-04T08:00:00.123Z");

describe("readProfileSnapshot, repli", () => {
  let warn: MockInstance<typeof console.warn>;
  let error: MockInstance<typeof console.error>;

  beforeEach(() => {
    vi.clearAllMocks();
    findFirst.mockResolvedValue(null);
    build.mockResolvedValue(doc);
    readDatabaseNow.mockResolvedValue(DB_NOW);
    write.mockResolvedValue({ written: true, inserted: true, changed: false });
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    error = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    warn.mockRestore();
    error.mockRestore();
  });

  it("rend le document construit quand l'écriture échoue, sans lever", async () => {
    write.mockRejectedValue(new Error("base en lecture seule"));
    await expect(readProfileSnapshot("slug-test")).resolves.toBe(doc);
    const lines = error.mock.calls.map((c) => JSON.parse(String(c[0])));
    expect(lines).toEqual([
      {
        event: "[profile-snapshot] fallback write failed",
        slug: "slug-test",
        message: "base en lecture seule",
      },
    ]);
  });

  it("signale le repli à Sentry avant l'écriture, puis l'échec d'écriture", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    // The write fails only once the fallback report has reached Sentry: a report sent after the
    // write would time out here. Waiting also keeps the two dynamic imports of the mocked module
    // from overlapping, which makes vitest resolve the second one to the real package.
    write.mockImplementation(async () => {
      await vi.waitFor(() => expect(captureMessage).toHaveBeenCalledTimes(1), { timeout: 500 });
      throw new Error("base en lecture seule");
    });
    await expect(readProfileSnapshot("slug-test")).resolves.toBe(doc);
    await vi.waitFor(() => expect(captureException).toHaveBeenCalledTimes(1));
    // Under a report sent after the write, the captured error would be the wait's timeout.
    expect((captureException.mock.calls[0]![0] as Error).message).toBe("base en lecture seule");
    expect(captureException.mock.calls[0]![1]).toMatchObject({
      fingerprint: ["profile-snapshot-fallback-write-failed"],
    });
  });

  it("date l'écriture du repli à l'horloge de la base", async () => {
    await readProfileSnapshot("slug-test");
    expect(write).toHaveBeenCalledExactlyOnceWith({
      politicianId: "pol-1",
      document: doc,
      startedAt: DB_NOW,
    });
  });
});
