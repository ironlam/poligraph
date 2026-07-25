import { describe, it, expect, vi, beforeEach } from "vitest";

// Affaires v2, lot 1: source creation stays a direct write (purely additive) but
// must be idempotent on a stable identity: (affairId, url).

const h = vi.hoisted(() => ({
  db: {
    source: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: h.db }));

import { upsertAffairSource } from "@/services/affairs/affair-source";

const db = h.db;

const INPUT = {
  affairId: "aff_1",
  url: "https://www.courdecassation.fr/decision/1",
  title: "Cour de cassation - cassation (23-80.000)",
  publisher: "Cour de cassation",
  publishedAt: new Date("2026-05-13T00:00:00.000Z"),
  sourceType: "JUDILIBRE" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.source.findUnique.mockResolvedValue(null);
  db.source.upsert.mockResolvedValue({ id: "src_new" });
});

describe("upsertAffairSource", () => {
  it("crée la source quand (affairId, url) est absent", async () => {
    const result = await upsertAffairSource(INPUT);

    expect(result).toEqual({ created: true, id: "src_new" });
    expect(db.source.upsert.mock.calls[0]![0].where).toEqual({
      affairId_url: { affairId: "aff_1", url: INPUT.url },
    });
  });

  it("ne recrée rien sur un rejeu : idempotent sur l'identité stable", async () => {
    db.source.findUnique.mockResolvedValue({ id: "src_existing" });

    const result = await upsertAffairSource(INPUT);

    expect(result).toEqual({ created: false, id: "src_existing" });
    expect(db.source.upsert).not.toHaveBeenCalled();
  });

  it("deux décisions distinctes sur la même affaire donnent deux sources", async () => {
    // Regression: the old code deduplicated on (affairId, sourceType), so a
    // second Cassation decision on the same affair was silently dropped.
    await upsertAffairSource(INPUT);
    await upsertAffairSource({
      ...INPUT,
      url: "https://www.courdecassation.fr/decision/2",
      title: "Cour de cassation - rejet (24-81.000)",
    });

    expect(db.source.upsert).toHaveBeenCalledTimes(2);
    const urls = db.source.upsert.mock.calls.map((c) => c[0].where.affairId_url.url);
    expect(new Set(urls).size).toBe(2);
  });

  it("un insert concurrent perdant ne réécrit pas la ligne existante", async () => {
    await upsertAffairSource(INPUT);

    // The upsert update branch is empty on purpose: whoever wrote first wins.
    expect(db.source.upsert.mock.calls[0]![0].update).toEqual({});
  });
});
