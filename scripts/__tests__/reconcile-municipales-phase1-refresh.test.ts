import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateMany, requestProfileRefresh } = vi.hoisted(() => ({
  updateMany: vi.fn(),
  requestProfileRefresh: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { mandate: { updateMany }, $disconnect: vi.fn() } }));
vi.mock("@/lib/identity", () => ({ resolveBatch: vi.fn() }));
vi.mock("@/lib/politicians/profile-snapshot/request", () => ({ requestProfileRefresh }));

import { closeObsoleteMandates } from "../reconcile-municipales-2026-mayors";

const REASON = "cli:reconcile-municipales-2026-mayors:phase1";

function items(n: number, politicianOf: (i: number) => string) {
  return Array.from({ length: n }, (_, i) => ({
    mandateId: `m${i}`,
    politicianId: politicianOf(i),
  }));
}

describe("closeObsoleteMandates (phase 1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("demande un seul recalcul avec les politiciens distincts après les clôtures", async () => {
    updateMany.mockImplementation(async (a: { where: { id: { in: string[] } } }) => ({
      count: a.where.id.in.length,
    }));
    const done = await closeObsoleteMandates(items(4, (i) => (i < 2 ? "pA" : `p${i}`)));
    expect(done).toBe(4);
    expect(requestProfileRefresh).toHaveBeenCalledTimes(1);
    expect(requestProfileRefresh).toHaveBeenCalledWith(
      { politicianIds: ["pA", "p2", "p3"] },
      REASON
    );
  });

  it("recalcule les politiciens du premier lot si le second échoue, et relance l'erreur", async () => {
    const boom = new Error("connexion perdue");
    updateMany.mockResolvedValueOnce({ count: 500 }).mockRejectedValueOnce(boom);
    // 501 items: chunk 1 = p0..p499, chunk 2 = p500
    await expect(closeObsoleteMandates(items(501, (i) => `p${i}`))).rejects.toBe(boom);
    expect(requestProfileRefresh).toHaveBeenCalledTimes(1);
    const arg = requestProfileRefresh.mock.calls[0]![0] as { politicianIds: string[] };
    expect(arg.politicianIds).toHaveLength(500);
    expect(arg.politicianIds).not.toContain("p500");
    expect(requestProfileRefresh.mock.calls[0]![1]).toBe(REASON);
  });

  it("ne demande rien quand aucun mandat n'est clos", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    expect(await closeObsoleteMandates(items(3, (i) => `p${i}`))).toBe(0);
    expect(requestProfileRefresh).not.toHaveBeenCalled();
  });
});
