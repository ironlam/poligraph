import { beforeEach, describe, it, expect, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  db: {
    parliamentaryGroup: { findMany: vi.fn() },
    scrutinGroupPosition: { findMany: vi.fn() },
    parliamentaryGroupStats: { upsert: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: state.db }));

import {
  computeAlignmentRates,
  computeAverageCohesion,
  computeGroupStats,
  computeGovernmentAlignment,
} from "../compute-group-stats";

beforeEach(() => {
  vi.clearAllMocks();
  state.rows.clear();
  state.db.parliamentaryGroup.findMany
    .mockResolvedValueOnce([{ id: "new-group", code: "TEST" }])
    .mockResolvedValueOnce([]);
  state.db.scrutinGroupPosition.findMany.mockResolvedValue([
    {
      scrutinId: "scrutin-1",
      position: "POUR",
      cohesionPct: 80,
      scrutin: { type: "FINAL" },
    },
  ]);
  state.db.parliamentaryGroupStats.upsert.mockImplementation(async ({ where, create, update }) => {
    const key = `${where.groupId_legislature.groupId}:${where.groupId_legislature.legislature}`;
    const existing = state.rows.get(key);
    const next = existing ? { ...existing, ...update } : { ...create };
    state.rows.set(key, next);
    return next;
  });
});

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

describe("computeGroupStats", () => {
  it("crée les métriques valides d'un nouveau groupe avec une participation NULL", async () => {
    const result = await computeGroupStats();
    const row = [...state.rows.values()][0];

    expect(result.groupsProcessed).toBe(1);
    expect(row).toMatchObject({
      groupId: "new-group",
      cohesionPct: 80,
      governmentAlignmentPct: 0,
      finalVoteAlignmentPct: 0,
      averageParticipationPct: null,
    });
  });

  it("remplace l'ancien taux numérique d'un groupe existant par NULL", async () => {
    state.rows.set("new-group:17", {
      groupId: "new-group",
      legislature: 17,
      cohesionPct: 12,
      governmentAlignmentPct: 34,
      finalVoteAlignmentPct: 56,
      averageParticipationPct: 92.5,
    });

    await computeGroupStats();

    expect([...state.rows.values()][0]).toMatchObject({
      cohesionPct: 80,
      governmentAlignmentPct: 0,
      finalVoteAlignmentPct: 0,
      averageParticipationPct: null,
    });
  });
});
