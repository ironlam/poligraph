import { beforeEach, describe, it, expect, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  scrutinFindMany: vi.fn(),
  factCheckGroupBy: vi.fn(),
  pressArticleFindMany: vi.fn(),
  pressArticleCount: vi.fn(),
  politicianFindMany: vi.fn(),
  affairFindMany: vi.fn(),
  platformUpdateFindMany: vi.fn(),
}));

vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: mocks.queryRaw,
    scrutin: { findMany: mocks.scrutinFindMany },
    factCheck: { groupBy: mocks.factCheckGroupBy },
    pressArticle: { findMany: mocks.pressArticleFindMany, count: mocks.pressArticleCount },
    politician: { findMany: mocks.politicianFindMany },
    affair: { findMany: mocks.affairFindMany },
    platformUpdate: { findMany: mocks.platformUpdateFindMany },
  },
}));

import { getISOWeekString, getWeeklyRecap, parseISOWeekString } from "../recap";

function rawSqlText(call: unknown[]): string {
  const query = call[0] as { sql?: string } | readonly string[];
  if (!Array.isArray(query)) return (query as { sql?: string }).sql ?? "";
  const strings = query;
  const values = call.slice(1);
  return strings
    .map((part, index) => {
      const value = values[index] as { sql?: string } | undefined;
      return `${part}${value?.sql ?? "?"}`;
    })
    .join("");
}

describe("getISOWeekString", () => {
  it("formats 2026-W18 for the Monday of ISO week 18", () => {
    // ISO Monday W18 of 2026 = April 27, 2026
    expect(getISOWeekString(new Date(Date.UTC(2026, 3, 27)))).toBe("2026-W18");
  });

  it("pads single-digit week to 2 digits", () => {
    // Monday W5 of 2026 = January 26, 2026
    const monday = new Date(Date.UTC(2026, 0, 26));
    expect(getISOWeekString(monday)).toBe("2026-W05");
  });

  it("handles week-year boundary (Dec 29 2025 belongs to 2026-W01)", () => {
    // ISO Monday W1 of 2026 = December 29, 2025
    expect(getISOWeekString(new Date(Date.UTC(2025, 11, 29)))).toBe("2026-W01");
  });
});

describe("parseISOWeekString", () => {
  it("parses 2026-W18 to its Monday", () => {
    const d = parseISOWeekString("2026-W18");
    expect(d).not.toBeNull();
    expect(d!.toISOString().slice(0, 10)).toBe("2026-04-27");
  });

  it("returns null on invalid format", () => {
    expect(parseISOWeekString("2026-18")).toBeNull();
    expect(parseISOWeekString("garbage")).toBeNull();
    expect(parseISOWeekString("")).toBeNull();
  });

  it("returns null on out-of-range week", () => {
    expect(parseISOWeekString("2026-W00")).toBeNull();
    expect(parseISOWeekString("2026-W54")).toBeNull();
  });

  it("round-trips with getISOWeekString", () => {
    const monday = new Date(Date.UTC(2026, 3, 27));
    const iso = getISOWeekString(monday);
    const parsed = parseISOWeekString(iso);
    expect(parsed!.toISOString()).toBe(monday.toISOString());
  });
});

describe("frontières publiques du récapitulatif", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryRaw.mockResolvedValue([]);
    mocks.scrutinFindMany.mockResolvedValue([]);
    mocks.factCheckGroupBy.mockResolvedValue([]);
    mocks.pressArticleFindMany.mockResolvedValue([]);
    mocks.pressArticleCount.mockResolvedValue(0);
    mocks.politicianFindMany.mockResolvedValue([]);
    mocks.affairFindMany.mockResolvedValue([]);
    mocks.platformUpdateFindMany.mockResolvedValue([]);
  });

  it("ignore les affaires et fact-checks non publics ainsi que leurs personnalités DRAFT", async () => {
    const recap = await getWeeklyRecap(new Date("2026-08-10T00:00:00.000Z"));

    expect(recap.affairs).toEqual({ newAffairs: [], total: 0 });
    expect(recap.factChecks).toEqual({
      total: 0,
      trueCount: 0,
      falseCount: 0,
      mixedCount: 0,
      topPoliticians: [],
    });

    expect(mocks.factCheckGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publicationStatus: "PUBLISHED",
          source: expect.objectContaining({ in: expect.any(Array) }),
        }),
      })
    );

    const sql = mocks.queryRaw.mock.calls.map(rawSqlText);
    const affairQuery = sql.find((query) => query.includes('FROM "Affair" a'));
    const factCheckQuery = sql.find((query) => query.includes('JOIN "FactCheck" fc'));

    expect(affairQuery).toContain('a."publicationStatus" =');
    expect(affairQuery).toContain('p."publicationStatus" =');
    expect(affairQuery).toContain("a.involvement NOT IN");
    expect(factCheckQuery).toContain('fc."publicationStatus" =');
    expect(factCheckQuery).toContain("fc.source IN");
    expect(factCheckQuery).toContain('p."publicationStatus" =');
  });
});
