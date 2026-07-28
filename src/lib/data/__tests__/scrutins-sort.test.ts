import { vi, describe, it, expect, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    scrutin: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { normalizeSort, sortScrutinsInMemory, getScrutins } from "@/lib/data/scrutins";

describe("normalizeSort", () => {
  it("accepte la whitelist", () => {
    expect(normalizeSort("recent")).toBe("recent");
    expect(normalizeSort("close")).toBe("close");
    expect(normalizeSort("turnout")).toBe("turnout");
  });
  it("retombe sur recent pour toute autre valeur (dont tentative d'injection)", () => {
    expect(normalizeSort(undefined)).toBe("recent");
    expect(normalizeSort("")).toBe("recent");
    expect(normalizeSort("votingDate; DROP TABLE")).toBe("recent");
    expect(normalizeSort("RECENT")).toBe("recent");
  });
});

describe("sortScrutinsInMemory", () => {
  const rows = [
    {
      id: "a",
      votesFor: 100,
      votesAgainst: 98,
      votesAbstain: 2,
      votingDate: new Date("2026-01-01"),
    },
    {
      id: "b",
      votesFor: 300,
      votesAgainst: 10,
      votesAbstain: 0,
      votingDate: new Date("2026-02-01"),
    },
    {
      id: "c",
      votesFor: 50,
      votesAgainst: 49,
      votesAbstain: 40,
      votingDate: new Date("2026-03-01"),
    },
  ];
  it("close = marge |pour-contre| croissante", () => {
    expect(sortScrutinsInMemory(rows, "close").map((r) => r.id)).toEqual(["c", "a", "b"]);
  });
  it("turnout = total votants décroissant", () => {
    expect(sortScrutinsInMemory(rows, "turnout").map((r) => r.id)).toEqual(["b", "a", "c"]);
  });
  it("recent = date décroissante", () => {
    expect(sortScrutinsInMemory(rows, "recent").map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("tableau vide ne plante pas, pour les 3 sorts", () => {
    expect(sortScrutinsInMemory([], "recent")).toEqual([]);
    expect(sortScrutinsInMemory([], "close")).toEqual([]);
    expect(sortScrutinsInMemory([], "turnout")).toEqual([]);
  });

  it("votingDate null passe en dernier sur 'recent' (traité comme epoch 0)", () => {
    const withNull = [
      {
        id: "withDate",
        votesFor: 10,
        votesAgainst: 5,
        votesAbstain: 0,
        votingDate: new Date("2026-01-01"),
      },
      { id: "noDate", votesFor: 10, votesAgainst: 5, votesAbstain: 0, votingDate: null },
    ];
    expect(sortScrutinsInMemory(withNull, "recent").map((r) => r.id)).toEqual([
      "withDate",
      "noDate",
    ]);
  });

  it("votingDate null ne casse pas le tri 'close' (tie-break par date)", () => {
    // Même marge (0) pour les deux -> départage par date décroissante ;
    // "a" (votingDate null) vaut epoch 0, donc passe après "b".
    const withNull = [
      { id: "a", votesFor: 100, votesAgainst: 100, votesAbstain: 0, votingDate: null },
      {
        id: "b",
        votesFor: 50,
        votesAgainst: 50,
        votesAbstain: 0,
        votingDate: new Date("2026-01-01"),
      },
    ];
    expect(sortScrutinsInMemory(withNull, "close").map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("votingDate null ne casse pas le tri 'turnout' (tie-break par date)", () => {
    // Même total de votants (200) pour les deux -> départage par date
    // décroissante ; "a" (votingDate null) vaut epoch 0, donc passe après "b".
    const withNull = [
      { id: "a", votesFor: 100, votesAgainst: 50, votesAbstain: 50, votingDate: null },
      {
        id: "b",
        votesFor: 150,
        votesAgainst: 30,
        votesAbstain: 20,
        votingDate: new Date("2026-01-01"),
      },
    ];
    expect(sortScrutinsInMemory(withNull, "turnout").map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("getScrutins router — sort normalisé avant la frontière de cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (db.scrutin.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.scrutin.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (db.scrutin.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  // fetchSortedPage takes two distinct shapes: `recent` issues one ordered
  // findMany (orderBy/skip/take); `close`/`turnout` issue an unordered
  // findMany over sortable fields only (sorted in memory). Asserting which
  // shape reached the db mock is an observable proxy for "which ScrutinSort
  // value queryScrutins actually received" without exporting the private
  // getScrutinsFiltered/queryScrutins functions just for this test.
  it("un sort garbage suit le même chemin de requête que 'recent' (pas de branche non-whitelistée)", async () => {
    await getScrutins({ page: 1, limit: 20, sort: "garbage" as never });

    expect(db.scrutin.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { votingDate: "desc" }, skip: 0, take: 20 })
    );
  });

  it("un sort valide ('turnout') ne prend pas le chemin 'recent'", async () => {
    await getScrutins({ page: 1, limit: 20, sort: "turnout" });

    for (const call of (db.scrutin.findMany as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[0]).not.toEqual(expect.objectContaining({ orderBy: { votingDate: "desc" } }));
    }
  });

  it("omettre sort garde le comportement par défaut ('recent')", async () => {
    await getScrutins({ page: 1, limit: 20 });

    expect(db.scrutin.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { votingDate: "desc" }, skip: 0, take: 20 })
    );
  });
});
