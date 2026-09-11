import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getField: vi.fn(),
  getContext: vi.fn(),
  groupBy: vi.fn(),
  snapshotFindUnique: vi.fn(),
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
  db: {
    affair: { groupBy: mocks.groupBy },
    statsSnapshot: { findUnique: (...args: unknown[]) => mocks.snapshotFindUnique(...args) },
  },
}));

import { getPresidentialOverviewStats } from "../presidential-stats";

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
  mocks.snapshotFindUnique.mockResolvedValue(null);
});

describe("getPresidentialOverviewStats", () => {
  it("compte les personnalités, les programmes documentés et les thèmes comparables", async () => {
    await expect(getPresidentialOverviewStats("presidentielle-2027")).resolves.toEqual({
      trackedCandidacyCount: 3,
      documentedCandidacyCount: 2,
      verifiedMeasureCount: 14,
      comparableThemeCount: 5,
      probityCandidateCount: 2,
    });
    expect(mocks.cacheTag).toHaveBeenCalledWith("statistics", "affairs", "elections");
    // `synced` and not a shorter profile: a route's effective ISR revalidate is the MIN of its own
    // and of every boundary it reads, so `minutes` here held /statistiques at 60 s.
    expect(mocks.cacheLife).toHaveBeenCalledWith("synced");
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

/**
 * The probity count used to run an EXISTS over the 1.2M-row Candidacy table on the request path,
 * which Sentry flagged as POLIGRAPH-1H: 0.6 ms warm but 4.5 s on a cold buffer cache. The count is
 * now pre-computed by the daily sync, and the live computation stays as the fallback so a missing
 * snapshot degrades speed rather than correctness.
 */
describe("compteur de probité pré-calculé", () => {
  it("lit le snapshot sans interroger Affair", async () => {
    mocks.snapshotFindUnique.mockResolvedValue({
      data: { electionSlug: "presidentielle-2027", count: 7 },
      computedAt: new Date(),
    });

    const stats = await getPresidentialOverviewStats("presidentielle-2027");

    expect(stats?.probityCandidateCount).toBe(7);
    expect(mocks.groupBy).not.toHaveBeenCalled();
  });

  it("retombe sur le calcul direct quand le snapshot est absent", async () => {
    mocks.snapshotFindUnique.mockResolvedValue(null);

    const stats = await getPresidentialOverviewStats("presidentielle-2027");

    // Two rows in the default groupBy mock, so the fallback must report 2, not 0.
    expect(stats?.probityCandidateCount).toBe(2);
    expect(mocks.groupBy).toHaveBeenCalled();
  });

  it("retombe aussi sur le calcul direct si le snapshot est illisible", async () => {
    // A row whose JSON drifted must not be served as a silent zero.
    mocks.snapshotFindUnique.mockResolvedValue({ data: { count: "sept" } });

    const stats = await getPresidentialOverviewStats("presidentielle-2027");

    expect(stats?.probityCandidateCount).toBe(2);
    expect(mocks.groupBy).toHaveBeenCalled();
  });
});

describe("fraîcheur du snapshot", () => {
  it("sert un snapshot récent", async () => {
    mocks.snapshotFindUnique.mockResolvedValue({
      data: { electionSlug: "presidentielle-2027", count: 7 },
      computedAt: new Date(),
    });
    const stats = await getPresidentialOverviewStats("presidentielle-2027");
    expect(stats?.probityCandidateCount).toBe(7);
    expect(mocks.groupBy).not.toHaveBeenCalled();
  });

  it("refuse un snapshot abandonné et recalcule", async () => {
    // The daily step is allowFailure, so a broken job leaves the previous row in place. Serving a
    // months-old conviction count as current would be a false claim, not a slow page.
    mocks.snapshotFindUnique.mockResolvedValue({
      data: { electionSlug: "presidentielle-2027", count: 7 },
      computedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    });
    const stats = await getPresidentialOverviewStats("presidentielle-2027");
    expect(stats?.probityCandidateCount).toBe(2);
    expect(mocks.groupBy).toHaveBeenCalled();
  });
});

describe("snapshot sans horodatage", () => {
  it("ne fait pas confiance à une ligne sans computedAt", async () => {
    // Prisma always writes computedAt, so its absence means the row did not come from the job.
    mocks.snapshotFindUnique.mockResolvedValue({
      data: { electionSlug: "presidentielle-2027", count: 7 },
    });
    const stats = await getPresidentialOverviewStats("presidentielle-2027");
    expect(stats?.probityCandidateCount).toBe(2);
    expect(mocks.groupBy).toHaveBeenCalled();
  });
});
