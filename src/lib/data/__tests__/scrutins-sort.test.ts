import { vi, describe, it, expect } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    scrutin: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
  },
}));

import { normalizeSort, sortScrutinsInMemory } from "@/lib/data/scrutins";

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
});
