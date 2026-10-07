import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  transaction: vi.fn(),
  findMany: vi.fn(),
  queryRaw: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    affair: { findMany: h.findMany },
    affairMonitoring: { findMany: h.findMany },
    $queryRaw: h.queryRaw,
    $transaction: h.transaction,
  },
}));

import { reconcileAllAffairMonitoring } from "../reconcile";

describe("balayage : isolation des échecs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(h.error);
    h.findMany.mockReset();
    h.findMany.mockResolvedValueOnce([{ id: "a1" }, { id: "a2" }, { id: "a3" }]);
    h.findMany.mockResolvedValue([]);
    h.queryRaw.mockResolvedValue([]);
  });

  it("continue après l'échec d'une affaire, le compte et ne journalise que son id", async () => {
    h.transaction
      .mockResolvedValueOnce({ kind: "create" })
      .mockRejectedValueOnce(new Error("Titre secret de l'affaire"))
      .mockResolvedValueOnce({ kind: "update", data: { active: false } });
    const result = await reconcileAllAffairMonitoring(new Date("2026-10-07T10:00:00Z"));
    expect(result).toEqual({ created: 1, updated: 0, deactivated: 1, failed: 1 });
    expect(h.transaction).toHaveBeenCalledTimes(3);
    const logged = JSON.stringify(h.error.mock.calls);
    expect(logged).toContain("a2");
    expect(logged).not.toContain("Titre secret");
  });
});
