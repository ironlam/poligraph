import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getField: vi.fn(),
  getContext: vi.fn(),
  groupBy: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));

vi.mock("next/cache", () => ({
  cacheLife: mocks.cacheLife,
  cacheTag: mocks.cacheTag,
}));

vi.mock("@/lib/data/hub", () => ({
  getHubCandidacyField: (...args: unknown[]) => mocks.getField(...args),
  getHubMeasureContext: (...args: unknown[]) => mocks.getContext(...args),
}));

vi.mock("@/lib/db", () => ({
  db: { affair: { groupBy: mocks.groupBy } },
}));

import { getPresidentialOverviewStats } from "../presidential-stats";

describe("getPresidentialOverviewStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getField.mockResolvedValue([
      { id: "c1", measureCount: 12 },
      { id: "c2", measureCount: 0 },
      { id: "c3", measureCount: 2 },
    ]);
    mocks.getContext.mockResolvedValue({
      verifiedMeasureCount: 14,
      publishableSubjectPageCount: 5,
    });
    mocks.groupBy.mockResolvedValue([{ politicianId: "p1" }, { politicianId: "p3" }]);
  });

  it("compte les personnalités, les programmes documentés et les thèmes comparables", async () => {
    await expect(getPresidentialOverviewStats("presidentielle-2027")).resolves.toEqual({
      trackedCandidacyCount: 3,
      documentedCandidacyCount: 2,
      verifiedMeasureCount: 14,
      comparableThemeCount: 5,
      probityCandidateCount: 2,
    });
    expect(mocks.cacheTag).toHaveBeenCalledWith("statistics", "affairs", "elections");
    expect(mocks.cacheLife).toHaveBeenCalledWith("minutes");
  });

  it("limite la probité aux condamnations publiées des personnalités suivies", async () => {
    await getPresidentialOverviewStats("presidentielle-2027");

    expect(mocks.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["politicianId"],
        where: expect.objectContaining({
          publicationStatus: "PUBLISHED",
          involvement: { in: ["DIRECT", "INDIRECT"] },
          status: { in: expect.any(Array) },
          category: { in: expect.any(Array) },
        }),
      })
    );
  });

  it("ne publie aucune statistique pour une élection inconnue", async () => {
    mocks.getContext.mockResolvedValue(null);

    await expect(getPresidentialOverviewStats("inconnue")).resolves.toBeNull();
  });
});
