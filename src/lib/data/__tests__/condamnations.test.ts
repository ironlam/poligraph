import { vi } from "vitest";

vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    affair: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { describe, it, expect, beforeEach } from "vitest";
import { getCondamnations } from "../condamnations";
import { db } from "@/lib/db";
import type { Mock } from "vitest";

const mockFindMany = db.affair.findMany as Mock;
const mockCount = db.affair.count as Mock;

describe("getCondamnations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
  });

  it("returns a paginated list with default filters (no mandat, certainty=tous)", async () => {
    const result = await getCondamnations({});
    expect(result).toHaveProperty("affairs");
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("totalPages");
    expect(result).toHaveProperty("page");
    expect(Array.isArray(result.affairs)).toBe(true);
    expect(result.affairs.length).toBeLessThanOrEqual(30);
    expect(result.page).toBe(1);
  });

  it("passes mandat=depute as mandates.some.type filter", async () => {
    await getCondamnations({ mandat: "depute" });
    expect(mockFindMany).toHaveBeenCalledOnce();
    const args = mockFindMany.mock.calls[0]![0];
    expect(args.where.politician.mandates.some.type.in).toEqual(["DEPUTE", "DEPUTE_EUROPEEN"]);
  });

  it("passes certainty=etabli as status filter (single status)", async () => {
    await getCondamnations({ certainty: "etabli" });
    const args = mockFindMany.mock.calls[0]![0];
    expect(args.where.status.in).toEqual(["CONDAMNATION_DEFINITIVE"]);
  });

  it("passes certainty=prononcee as status filter (two statuses)", async () => {
    await getCondamnations({ certainty: "prononcee" });
    const args = mockFindMany.mock.calls[0]![0];
    expect(args.where.status.in).toEqual(["CONDAMNATION_PREMIERE_INSTANCE", "APPEL_EN_COURS"]);
  });

  it("omits status filter when certainty=tous (default)", async () => {
    await getCondamnations({});
    const args = mockFindMany.mock.calls[0]![0];
    expect(args.where.status).toBeUndefined();
  });

  it("applies partiSlug as OR clause on partyAtTime and currentParty", async () => {
    await getCondamnations({ partiSlug: "rn" });
    const args = mockFindMany.mock.calls[0]![0];
    expect(args.where.OR).toEqual([
      { partyAtTime: { slug: "rn" } },
      { politician: { currentParty: { slug: "rn" } } },
    ]);
  });

  it("applies pagination correctly (page 2 skips 30)", async () => {
    await getCondamnations({ page: 2 });
    const args = mockFindMany.mock.calls[0]![0];
    expect(args.skip).toBe(30);
    expect(args.take).toBe(30);
  });

  it("default sort uses verdictDate desc then startDate desc", async () => {
    await getCondamnations({});
    const args = mockFindMany.mock.calls[0]![0];
    expect(args.orderBy[0]).toEqual({ verdictDate: "desc" });
  });

  it("sort=nom uses politician lastName asc", async () => {
    await getCondamnations({ sort: "nom" });
    const args = mockFindMany.mock.calls[0]![0];
    expect(args.orderBy[0]).toEqual({ politician: { lastName: "asc" } });
  });
});
