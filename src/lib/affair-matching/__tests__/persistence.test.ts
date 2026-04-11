import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    politician: { findMany: vi.fn() },
    affairPoliticianDecision: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { computeTextHash, persistDecision, loadBlocklist } from "../persistence";
import type { CombinerDecision } from "../combiner";
import { db } from "@/lib/db";
import { SourceType } from "@/generated/prisma";
import type { Mock } from "vitest";

const mockDecisionCreate = db.affairPoliticianDecision.create as Mock;
const mockDecisionFindUnique = db.affairPoliticianDecision.findUnique as Mock;
const mockDecisionFindMany = db.affairPoliticianDecision.findMany as Mock;

describe("computeTextHash", () => {
  it("produces a stable sha256 hex digest", () => {
    const h1 = computeTextHash("Le député Dupont");
    const h2 = computeTextHash("Le député Dupont");
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("differs for different inputs", () => {
    expect(computeTextHash("a")).not.toBe(computeTextHash("b"));
  });
});

describe("persistDecision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes a new decision record with the combiner result", async () => {
    mockDecisionFindUnique.mockResolvedValue(null);
    mockDecisionCreate.mockResolvedValue({ id: "dec-1" });

    const decision: CombinerDecision = {
      judgment: "SAME",
      topCandidateId: "pol-1",
      topScore: 10.0,
      gap: 5.0,
      topCandidates: [{ candidateId: "pol-1", totalScore: 10.0, signals: [] }],
    };

    const result = await persistDecision({
      text: "Jean Dupont a été mis en examen.",
      metadata: { source: SourceType.PRESSE, sourceRef: "lemonde.fr/article/1" },
      decision,
    });

    expect(result.decisionId).toBe("dec-1");
    expect(mockDecisionCreate).toHaveBeenCalledOnce();
    const payload = (mockDecisionCreate.mock.calls[0]![0] as { data: Record<string, unknown> })
      .data;
    expect(payload.judgment).toBe("SAME");
    expect(payload.topScore).toBe(10.0);
  });

  it("returns the existing decision id on duplicate (idempotency)", async () => {
    mockDecisionFindUnique.mockResolvedValue({ id: "dec-existing" });

    const decision: CombinerDecision = {
      judgment: "SAME",
      topCandidateId: "pol-1",
      topScore: 10.0,
      gap: 5.0,
      topCandidates: [],
    };

    const result = await persistDecision({
      text: "Jean Dupont a été mis en examen.",
      metadata: { source: SourceType.PRESSE, sourceRef: "lemonde.fr/article/1" },
      decision,
    });

    expect(result.decisionId).toBe("dec-existing");
    expect(mockDecisionCreate).not.toHaveBeenCalled();
  });

  it("coerces null/undefined sourceRef to empty string for the unique constraint", async () => {
    mockDecisionFindUnique.mockResolvedValue(null);
    mockDecisionCreate.mockResolvedValue({ id: "dec-2" });

    const decision: CombinerDecision = {
      judgment: "NO_MATCH",
      topCandidateId: null,
      topScore: 0,
      gap: 0,
      topCandidates: [],
    };

    await persistDecision({
      text: "Unknown affair",
      metadata: { source: SourceType.PRESSE }, // no sourceRef
      decision,
    });

    // The unique-key lookup should use empty string sentinel for sourceRef
    expect(mockDecisionFindUnique).toHaveBeenCalled();
    const whereArg = (
      mockDecisionFindUnique.mock.calls[0]![0] as {
        where: { textHash_source_sourceRef: { sourceRef: string } };
      }
    ).where.textHash_source_sourceRef;
    expect(whereArg.sourceRef).toBe("");
  });
});

describe("loadBlocklist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a set of politician IDs for NOT_SAME decisions matching the textHash", async () => {
    mockDecisionFindMany.mockResolvedValue([
      { chosenPoliticianId: "pol-a" },
      { chosenPoliticianId: "pol-b" },
      { chosenPoliticianId: null },
    ]);

    const result = await loadBlocklist("sha256-abc");
    expect(result.has("pol-a")).toBe(true);
    expect(result.has("pol-b")).toBe(true);
    expect(result.size).toBe(2);
  });
});
