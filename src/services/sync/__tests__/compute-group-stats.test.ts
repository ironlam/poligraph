import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import {
  computeAlignmentRates,
  computeAverageCohesion,
  computeGovernmentAlignment,
} from "../compute-group-stats";

describe("computeAverageCohesion", () => {
  it("averages cohesion across all group positions", () => {
    const result = computeAverageCohesion([
      { cohesionPct: 80 },
      { cohesionPct: 90 },
      { cohesionPct: 70 },
    ]);
    expect(result).toBeCloseTo(80, 0);
  });

  it("returns 0 for empty array", () => {
    expect(computeAverageCohesion([])).toBe(0);
  });
});

describe("computeGovernmentAlignment", () => {
  it("computes alignment as % of matching positions", () => {
    const result = computeGovernmentAlignment({
      groupPositions: [
        { scrutinId: "1", position: "POUR" },
        { scrutinId: "2", position: "CONTRE" },
        { scrutinId: "3", position: "POUR" },
      ],
      govGroupPositions: [
        { scrutinId: "1", position: "POUR" },
        { scrutinId: "2", position: "POUR" },
        { scrutinId: "3", position: "POUR" },
      ],
    });
    expect(result).toBeCloseTo(66.7, 0);
  });

  it("returns 0 when no government positions exist", () => {
    const result = computeGovernmentAlignment({
      groupPositions: [{ scrutinId: "1", position: "POUR" }],
      govGroupPositions: [],
    });
    expect(result).toBe(0);
  });
});

describe("computeAlignmentRates", () => {
  it("separates all scrutin types from final votes", () => {
    const result = computeAlignmentRates({
      groupPositions: [
        { scrutinId: "final-1", position: "POUR", scrutin: { type: "FINAL" } },
        { scrutinId: "final-2", position: "CONTRE", scrutin: { type: "FINAL" } },
        { scrutinId: "amendement-1", position: "POUR", scrutin: { type: "AMENDEMENT" } },
        { scrutinId: "amendement-2", position: "POUR", scrutin: { type: "AMENDEMENT" } },
      ],
      govGroupPositions: [
        { scrutinId: "final-1", position: "POUR", scrutin: { type: "FINAL" } },
        { scrutinId: "final-2", position: "POUR", scrutin: { type: "FINAL" } },
        { scrutinId: "amendement-1", position: "POUR", scrutin: { type: "AMENDEMENT" } },
        { scrutinId: "amendement-2", position: "POUR", scrutin: { type: "AMENDEMENT" } },
      ],
    });

    expect(result.governmentAlignmentPct).toBe(75);
    expect(result.finalVoteAlignmentPct).toBe(50);
  });
});
