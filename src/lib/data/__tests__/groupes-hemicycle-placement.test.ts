import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { parliamentaryGroup: { findMany: mocks.findMany } } }));

import { getGroupHemicyclePlacement } from "@/lib/data/groupes";

const group = (id: string, politicalPosition: string | null, seats: number) => ({
  id,
  code: id.toUpperCase(),
  politicalPosition,
  _count: { mandates: seats },
});

describe("getGroupHemicyclePlacement", () => {
  beforeEach(() => {
    mocks.findMany.mockReset();
    mocks.findMany.mockResolvedValue([
      group("d", "RIGHT", 50),
      group("ni", null, 8),
      group("g", "LEFT", 70),
      group("c", "CENTER", 100),
      group("b", "LEFT", 30),
    ]);
  });

  it("orders the benches by declared position, then by code", async () => {
    await expect(getGroupHemicyclePlacement("g", "AN")).resolves.toEqual({
      before: 30,
      seats: 70,
      total: 258,
    });
    await expect(getGroupHemicyclePlacement("d", "AN")).resolves.toEqual({
      before: 200,
      seats: 50,
      total: 258,
    });
  });

  it("draws no place for a group without a declared position", async () => {
    await expect(getGroupHemicyclePlacement("ni", "AN")).resolves.toBeNull();
  });

  it("draws no place for a group that no longer sits", async () => {
    await expect(getGroupHemicyclePlacement("ancien", "AN")).resolves.toBeNull();
  });

  it("counts sitting public members of the asked chamber only", async () => {
    await getGroupHemicyclePlacement("g", "SENAT");
    const { where } = mocks.findMany.mock.calls[0]![0];
    expect(where.chamber).toBe("SENAT");
    expect(where.mandates.some.mandate.isCurrent).toBe(true);
  });
});
