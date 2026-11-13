import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  legislativeDossier: { findMany: vi.fn() },
  amendment: { groupBy: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));

import { getLatestDossiers } from "../legislation";

describe("getLatestDossiers, décompte des amendements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.legislativeDossier.findMany.mockResolvedValue([{ id: "d1" }, { id: "d2" }]);
    dbMock.amendment.groupBy.mockResolvedValue([{ dossierId: "d1", _count: { _all: 42 } }]);
  });

  it("ne demande pas de _count dans la lecture des dossiers", async () => {
    // A `_count` there aggregates the whole Amendment table for six rows (POLIGRAPH-3Y).
    await getLatestDossiers(6);
    const { select } = dbMock.legislativeDossier.findMany.mock.calls[0]![0];
    expect(select).not.toHaveProperty("_count");
  });

  it("compte les amendements des seuls dossiers lus", async () => {
    await getLatestDossiers(6);
    expect(dbMock.amendment.groupBy.mock.calls[0]![0].where).toEqual({
      dossierId: { in: ["d1", "d2"] },
    });
  });

  it("rend le même format qu'avant, zéro pour un dossier sans amendement", async () => {
    const dossiers = await getLatestDossiers(6);
    expect(dossiers.map((d) => d._count.amendments)).toEqual([42, 0]);
  });
});
