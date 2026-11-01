import { describe, it, expect, beforeEach, vi } from "vitest";

const findMany = vi.fn();
const createMany = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    scrutin: { findMany: (...a: unknown[]) => findMany(...a) },
    impactRegenerationLog: { createMany: (...a: unknown[]) => createMany(...a) },
  },
}));

const generate = vi.fn();
vi.mock("@/services/sync/generate-scrutin-citizen-impacts", () => ({
  generateScrutinCitizenImpacts: (...a: unknown[]) => generate(...a),
}));

import {
  LEGACY_IMPACT_CUTOFF,
  regenerateLegacyImpacts,
} from "@/services/sync/regenerate-legacy-impacts";

const row = (id: string, outcome: string, detail?: string) => ({
  id,
  slug: null,
  title: null,
  outcome,
  detail,
});

beforeEach(() => {
  findMany.mockReset();
  createMany.mockReset();
  generate.mockReset();
});

describe("regenerateLegacyImpacts", () => {
  it("picks only legacy impacts, before the cutoff, not yet logged, most recent first", async () => {
    findMany.mockResolvedValue([]);
    await regenerateLegacyImpacts({ limit: 7 });

    const args = findMany.mock.calls[0]![0];
    expect(args.where.citizenImpact).toEqual({ contains: "Le débat" });
    expect(args.where.votingDate).toEqual({ lt: LEGACY_IMPACT_CUTOFF });
    expect(args.where.impactRegeneration).toBeNull();
    expect(args.where.summary).toEqual({ not: null });
    expect(args.take).toBe(7);
    expect(args.orderBy[0]).toEqual({ votingDate: "desc" });
  });

  it("does nothing, and calls no model, when the queue is empty", async () => {
    findMany.mockResolvedValue([]);
    const res = await regenerateLegacyImpacts({ limit: 10 });
    expect(res.selected).toBe(0);
    expect(generate).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });

  it("writes through the generator with force, scoped to the picked votes", async () => {
    findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    generate.mockResolvedValue({ outcomes: [row("a", "generated"), row("b", "generated")] });
    await regenerateLegacyImpacts({ limit: 2 });

    expect(generate).toHaveBeenCalledWith({ scrutinIds: ["a", "b"], force: true });
  });

  it("logs written and refused votes, so they leave the queue", async () => {
    findMany.mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]);
    generate.mockResolvedValue({
      outcomes: [
        row("a", "generated"),
        row("b", "ungrounded", "noms absents des sources : Canada"),
        row("c", "incoherent", "couverture 0.12"),
      ],
    });
    const res = await regenerateLegacyImpacts({ limit: 3 });

    expect(res).toMatchObject({ selected: 3, written: 1, refused: 2, failed: 0 });
    const data = createMany.mock.calls[0]![0].data as { scrutinId: string; outcome: string }[];
    expect(data.map((d) => d.scrutinId).sort()).toEqual(["a", "b", "c"]);
    expect(createMany.mock.calls[0]![0].skipDuplicates).toBe(true);
  });

  it("does not log a failure: the next run retries it", async () => {
    findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    generate.mockResolvedValue({
      outcomes: [row("a", "generated"), row("b", "error", "Mistral API error 429")],
    });
    const res = await regenerateLegacyImpacts({ limit: 2 });

    expect(res).toMatchObject({ written: 1, failed: 1 });
    const data = createMany.mock.calls[0]![0].data as { scrutinId: string }[];
    expect(data.map((d) => d.scrutinId)).toEqual(["a"]);
  });

  it("logs a vote the generator skipped entirely, so it does not come back every run", async () => {
    findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    generate.mockResolvedValue({ outcomes: [row("a", "generated")] });
    const res = await regenerateLegacyImpacts({ limit: 2 });

    expect(res.notEligible).toBe(1);
    const data = createMany.mock.calls[0]![0].data as { scrutinId: string; outcome: string }[];
    expect(data.find((d) => d.scrutinId === "b")?.outcome).toBe("not_eligible");
  });

  it("writes no log row when every vote failed", async () => {
    findMany.mockResolvedValue([{ id: "a" }]);
    generate.mockResolvedValue({ outcomes: [row("a", "error", "boom")] });
    await regenerateLegacyImpacts({ limit: 1 });
    expect(createMany).not.toHaveBeenCalled();
  });
});
