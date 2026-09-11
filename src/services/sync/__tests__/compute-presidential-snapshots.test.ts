import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ groupBy: vi.fn(), upsert: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: { affair: { groupBy: mocks.groupBy }, statsSnapshot: { upsert: mocks.upsert } },
}));

import { computePresidentialSnapshots } from "../compute-presidential-snapshots";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.groupBy.mockResolvedValue([{ politicianId: "p1" }, { politicianId: "p2" }]);
});

describe("computePresidentialSnapshots", () => {
  it("écrit le compteur en mode normal", async () => {
    const result = await computePresidentialSnapshots("presidentielle-2027");
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(result.computed).toHaveLength(1);
  });

  it("n'écrit rien en dry-run", async () => {
    // `.env` points at production on this project, so a preview run must not mutate it.
    const result = await computePresidentialSnapshots("presidentielle-2027", { dryRun: true });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(result.computed).toHaveLength(1);
  });
});
