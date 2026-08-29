import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/name-matching", () => ({
  normalizeText: vi.fn(),
  buildPoliticianIndex: vi.fn(),
  findMentions: vi.fn(),
}));
vi.mock("@/lib/identity/mention-blocklist", () => ({
  loadMentionBlocklist: vi.fn(),
}));

import { FACTCHECK_ALLOWED_SOURCES } from "@/config/labels";
import {
  getPublicationStatusForSource,
  rotateWindow,
  FACTCHECK_SEARCH_POOL_SIZE,
} from "@/services/sync/factchecks";

describe("getPublicationStatusForSource", () => {
  it("returns PUBLISHED for allowed sources", () => {
    for (const source of FACTCHECK_ALLOWED_SOURCES) {
      expect(getPublicationStatusForSource(source)).toBe("PUBLISHED");
    }
  });

  it("returns PUBLISHED for the spelling variants of an allowed source", () => {
    // The names Google actually returned for these outlets in 2026; matching
    // them literally kept the reviews in DRAFT and off every public listing.
    expect(getPublicationStatusForSource("franceinfo")).toBe("PUBLISHED");
    expect(getPublicationStatusForSource("De Facto")).toBe("PUBLISHED");
    expect(getPublicationStatusForSource("Factuel AFP")).toBe("PUBLISHED");
  });

  it("returns DRAFT for unknown sources", () => {
    expect(getPublicationStatusForSource("dpa-factchecking")).toBe("DRAFT");
    expect(getPublicationStatusForSource("Snopes")).toBe("DRAFT");
    expect(getPublicationStatusForSource("PolitiFact")).toBe("DRAFT");
  });

  it("keeps AFP's English desk out of the publishable set", () => {
    expect(getPublicationStatusForSource("AFP Fact Check")).toBe("DRAFT");
  });
});

describe("rotateWindow", () => {
  const pool = ["a", "b", "c", "d", "e"];

  it("takes the head at offset 0", () => {
    expect(rotateWindow(pool, 0, 2)).toEqual(["a", "b"]);
  });

  it("resumes where the previous window stopped", () => {
    expect(rotateWindow(pool, 2, 2)).toEqual(["c", "d"]);
  });

  it("wraps past the end instead of returning a short window", () => {
    expect(rotateWindow(pool, 4, 3)).toEqual(["e", "a", "b"]);
  });

  it("normalizes an offset beyond the pool", () => {
    expect(rotateWindow(pool, 7, 2)).toEqual(rotateWindow(pool, 2, 2));
  });

  it("never returns more than the pool holds", () => {
    expect(rotateWindow(pool, 1, 99)).toHaveLength(pool.length);
  });

  it("handles an empty pool", () => {
    expect(rotateWindow([], 3, 5)).toEqual([]);
  });

  it("covers the whole pool over successive windows", () => {
    const size = 2;
    const seen = new Set<string>();
    let offset = 0;
    for (let run = 0; run < Math.ceil(pool.length / size); run++) {
      for (const item of rotateWindow(pool, offset, size)) seen.add(item);
      offset = (offset + size) % pool.length;
    }
    expect(seen.size).toBe(pool.length);
  });
});

describe("FACTCHECK_SEARCH_POOL_SIZE", () => {
  it("lets the cron walk the whole pool inside a fortnight", () => {
    const perDay = 50 * 3; // --limit=50, three daily-sync runs a day
    expect(FACTCHECK_SEARCH_POOL_SIZE / perDay).toBeLessThan(14);
  });
});
