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
});
