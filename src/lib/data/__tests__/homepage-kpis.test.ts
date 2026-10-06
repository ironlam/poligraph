import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONVICTION_ROWS } from "@/lib/affairs/__tests__/fixtures/conviction-rows";
import { evaluateWhere } from "@/lib/affairs/__tests__/fixtures/evaluate-where";

const mocks = vi.hoisted(() => ({
  affairCount: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    politician: { count: vi.fn().mockResolvedValue(10) },
    affair: { count: (...args: unknown[]) => mocks.affairCount(...args) },
    scrutin: { count: vi.fn().mockResolvedValue(20) },
    factCheck: { count: vi.fn().mockResolvedValue(30) },
  },
}));

import { getHomepageKPIs } from "../homepage";

describe("getHomepageKPIs", () => {
  beforeEach(() => {
    mocks.affairCount.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      return Object.values(CONVICTION_ROWS).filter((r) => evaluateWhere(r, where)).length;
    });
  });

  it("sépare les condamnations définitives et non définitives", async () => {
    const kpis = await getHomepageKPIs();
    expect(kpis.condamnationsDefinitivesCount).toBe(3);
    expect(kpis.condamnationsNonDefinitivesCount).toBe(3);
  });

  it("compte une procédure en cours et une clôture sans condamnation", async () => {
    const kpis = await getHomepageKPIs();
    expect(kpis.proceduresEnCoursCount).toBe(1);
    expect(kpis.closesSansCondamnationCount).toBe(1);
  });
});
