import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    politician: {
      findMany: vi.fn(),
    },
    syncMetadata: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import {
  DISCOVER_AFFAIRS_CURSOR_KEY,
  discoverAffairs,
  getDiscoverAffairsCursor,
  saveDiscoverAffairsCursor,
} from "./discover-affairs";

describe("discover-affairs cursor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the expected sourceKey", () => {
    expect(DISCOVER_AFFAIRS_CURSOR_KEY).toBe("discover-affairs:cursor:lastName");
  });

  it("returns null on first run (no cursor row in DB)", async () => {
    vi.mocked(db.syncMetadata.findUnique).mockResolvedValueOnce(null as never);
    const cursor = await getDiscoverAffairsCursor();
    expect(cursor.lastName).toBeNull();
    expect(db.syncMetadata.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sourceKey: DISCOVER_AFFAIRS_CURSOR_KEY },
      })
    );
  });

  it("returns stored cursor when row exists", async () => {
    vi.mocked(db.syncMetadata.findUnique).mockResolvedValueOnce({
      cursor: "Martin",
    } as never);
    const cursor = await getDiscoverAffairsCursor();
    expect(cursor.lastName).toBe("Martin");
  });

  it("normalises empty-string cursor to null", async () => {
    vi.mocked(db.syncMetadata.findUnique).mockResolvedValueOnce({
      cursor: "",
    } as never);
    const cursor = await getDiscoverAffairsCursor();
    expect(cursor.lastName).toBeNull();
  });

  it("upserts the cursor row on save", async () => {
    vi.mocked(db.syncMetadata.upsert).mockResolvedValueOnce({} as never);
    await saveDiscoverAffairsCursor("Nguyen");

    expect(db.syncMetadata.upsert).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(db.syncMetadata.upsert).mock.calls[0]![0];
    expect(callArgs.where).toEqual({ sourceKey: DISCOVER_AFFAIRS_CURSOR_KEY });
    expect(callArgs.create).toMatchObject({
      sourceKey: DISCOVER_AFFAIRS_CURSOR_KEY,
      cursor: "Nguyen",
    });
    expect(callArgs.update).toMatchObject({ cursor: "Nguyen" });
  });

  it("resets cursor on save(null) so the next run starts from the beginning", async () => {
    vi.mocked(db.syncMetadata.upsert).mockResolvedValueOnce({} as never);
    await saveDiscoverAffairsCursor(null);

    expect(db.syncMetadata.upsert).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(db.syncMetadata.upsert).mock.calls[0]![0];
    expect(callArgs.update).toMatchObject({ cursor: null });
    expect(callArgs.create).toMatchObject({ cursor: null });
  });

  it("stamps lastSyncAt on every save", async () => {
    vi.mocked(db.syncMetadata.upsert).mockResolvedValueOnce({} as never);
    const before = Date.now();
    await saveDiscoverAffairsCursor("Test");
    const callArgs = vi.mocked(db.syncMetadata.upsert).mock.calls[0]![0];
    expect(callArgs.update.lastSyncAt).toBeInstanceOf(Date);
    expect((callArgs.update.lastSyncAt as Date).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("ne déplace jamais le curseur en dry-run", async () => {
    vi.mocked(db.syncMetadata.findUnique).mockResolvedValueOnce({ cursor: "Martin" } as never);
    vi.mocked(db.politician.findMany).mockResolvedValueOnce([] as never);

    await discoverAffairs({ limit: 10, dryRun: true });

    expect(db.syncMetadata.upsert).not.toHaveBeenCalled();
  });
});
