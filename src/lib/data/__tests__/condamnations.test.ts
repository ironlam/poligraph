import { vi } from "vitest";

vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    affair: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

import { describe, it, expect, beforeEach } from "vitest";
import { getCondamnations, getCondamnationsStatsByParty } from "../condamnations";
import { db } from "@/lib/db";
import type { Mock } from "vitest";

const mockFindMany = db.affair.findMany as Mock;
const mockCount = db.affair.count as Mock;
const mockQueryRaw = db.$queryRaw as Mock;

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

  it("passes certainty=prononcee as status filter (non-final convictions)", async () => {
    await getCondamnations({ certainty: "prononcee" });
    const args = mockFindMany.mock.calls[0]![0];
    expect(args.where.status.in).toEqual([
      "CONDAMNATION_PREMIERE_INSTANCE",
      "APPEL_EN_COURS",
      "POURVOI_EN_CASSATION",
    ]);
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

describe("getCondamnationsStatsByParty", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns stats with calculated tauxDefinitif from DB counts", async () => {
    mockQueryRaw.mockResolvedValue([
      {
        partyId: "p1",
        partySlug: "rn",
        partyShortName: "RN",
        partyName: "Rassemblement National",
        nSuivis: BigInt(100),
        nCondamnesDefinitifs: BigInt(10),
        nCondamnesPrononces: BigInt(3),
      },
      {
        partyId: "p2",
        partySlug: "lr",
        partyShortName: "LR",
        partyName: "Les Républicains",
        nSuivis: BigInt(50),
        nCondamnesDefinitifs: BigInt(0),
        nCondamnesPrononces: BigInt(1),
      },
    ]);
    const rows = await getCondamnationsStatsByParty();
    expect(rows).toHaveLength(2);
    expect(rows[0]!).toMatchObject({
      partyId: "p1",
      partySlug: "rn",
      partyShortName: "RN",
      nSuivis: 100,
      nCondamnesDefinitifs: 10,
      nCondamnesPrononces: 3,
      tauxDefinitif: 0.1,
    });
    expect(rows[1]!.tauxDefinitif).toBe(0);
  });

  it("handles empty result", async () => {
    mockQueryRaw.mockResolvedValue([]);
    const rows = await getCondamnationsStatsByParty();
    expect(rows).toEqual([]);
  });

  it("converts bigint DB counts to number safely", async () => {
    mockQueryRaw.mockResolvedValue([
      {
        partyId: "p1",
        partySlug: "x",
        partyShortName: "X",
        partyName: "X Party",
        nSuivis: BigInt(0),
        nCondamnesDefinitifs: BigInt(0),
        nCondamnesPrononces: BigInt(0),
      },
    ]);
    const rows = await getCondamnationsStatsByParty();
    expect(rows[0]!.nSuivis).toBe(0);
    expect(rows[0]!.nCondamnesDefinitifs).toBe(0);
    expect(rows[0]!.tauxDefinitif).toBe(0); // division by zero guard
  });
});
