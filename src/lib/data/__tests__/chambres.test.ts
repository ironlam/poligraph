import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  scrutin: { count: vi.fn(), findMany: vi.fn() },
}));

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import { getChamberOverview } from "@/lib/data/chambres";

const scrutin = (id: string, votingDate: string) => ({
  id,
  slug: `scrutin-${id}`,
  title: `Scrutin ${id}`,
  votingDate: new Date(votingDate),
  result: "ADOPTED" as const,
});

describe("getChamberOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["AN", "SENAT"] as const)("scopes both queries to the %s chamber", async (chamber) => {
    dbMock.scrutin.count.mockResolvedValue(0);
    dbMock.scrutin.findMany.mockResolvedValue([]);

    await getChamberOverview(chamber);

    expect(dbMock.scrutin.count).toHaveBeenCalledWith({ where: { chamber } });
    expect(dbMock.scrutin.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { chamber } })
    );
  });

  it("asks for the five most recent scrutins, newest first", async () => {
    dbMock.scrutin.count.mockResolvedValue(0);
    dbMock.scrutin.findMany.mockResolvedValue([]);

    await getChamberOverview("AN");

    expect(dbMock.scrutin.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ votingDate: "desc" }, { sequence: "desc" }], take: 5 })
    );
  });

  it("returns the total, the list and the date of the latest scrutin", async () => {
    const latest = [scrutin("b", "2026-10-02"), scrutin("a", "2026-09-15")];
    dbMock.scrutin.count.mockResolvedValue(1234);
    dbMock.scrutin.findMany.mockResolvedValue(latest);

    const overview = await getChamberOverview("SENAT");

    expect(overview.totalScrutins).toBe(1234);
    expect(overview.latestScrutins).toEqual(latest);
    expect(overview.lastScrutinDate).toEqual(new Date("2026-10-02"));
  });

  it("states an empty chamber with a null date instead of inventing one", async () => {
    dbMock.scrutin.count.mockResolvedValue(0);
    dbMock.scrutin.findMany.mockResolvedValue([]);

    expect(await getChamberOverview("SENAT")).toEqual({
      totalScrutins: 0,
      latestScrutins: [],
      lastScrutinDate: null,
    });
  });
});
