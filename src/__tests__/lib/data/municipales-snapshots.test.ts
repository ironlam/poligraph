import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MUNICIPALES_SNAPSHOT_KEYS } from "@/types/stats-snapshots";

const findUniqueMock = vi.fn();
const queryRawMock = vi.fn();
const electionFindUniqueMock = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    statsSnapshot: { findUnique: (...args: unknown[]) => findUniqueMock(...args) },
    election: { findUnique: (...args: unknown[]) => electionFindUniqueMock(...args) },
    $queryRaw: (...args: unknown[]) => queryRawMock(...args),
  },
}));

vi.mock("next/cache", () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

// Import AFTER mocks
import { getParityOutliers, getParityBySize, getDepartmentPartyData } from "@/lib/data/municipales";

describe("municipales snapshot fallback", () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    queryRawMock.mockReset();
    electionFindUniqueMock.mockReset();
    electionFindUniqueMock.mockResolvedValue({ id: "election-municipales-2026-id" });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("getParityOutliers reads from snapshot when present", async () => {
    findUniqueMock.mockResolvedValueOnce({
      key: MUNICIPALES_SNAPSHOT_KEYS.parityOutliers,
      data: {
        best: [
          {
            listName: "Liste A",
            communeId: "75056",
            communeName: "Paris",
            departmentCode: "75",
            femaleRate: 0.5,
            candidateCount: 30,
          },
        ],
        worst: [
          {
            listName: "Liste B",
            communeId: "13055",
            communeName: "Marseille",
            departmentCode: "13",
            femaleRate: 0.1,
            candidateCount: 30,
          },
        ],
      },
      computedAt: new Date(),
    });

    const result = await getParityOutliers();

    expect(result.best).toHaveLength(1);
    expect(result.worst).toHaveLength(1);
    expect(result.best[0]?.listName).toBe("Liste A");
    expect(queryRawMock).not.toHaveBeenCalled(); // didn't fall back to live
  });

  it("getParityOutliers falls back to live SQL when snapshot is missing", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    // Single-pass query: one $queryRaw returns both buckets, tagged by `bucket`.
    queryRawMock.mockResolvedValueOnce([
      {
        bucket: "best",
        listName: "Live A",
        communeId: "x",
        communeName: "X",
        departmentCode: "01",
        femaleRate: 0.5,
        candidateCount: 30,
      },
      {
        bucket: "worst",
        listName: "Live B",
        communeId: "y",
        communeName: "Y",
        departmentCode: "02",
        femaleRate: 0.0,
        candidateCount: 30,
      },
    ]);

    const result = await getParityOutliers();

    expect(result.best[0]?.listName).toBe("Live A");
    expect(result.worst[0]?.listName).toBe("Live B");
    expect(queryRawMock).toHaveBeenCalledTimes(1); // single-pass live fallback
  });

  it("getParityBySize falls back to live when snapshot missing", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    queryRawMock.mockResolvedValueOnce([
      { bracket: "< 1 000 hab.", femaleCount: 5, totalCount: 10 },
    ]);

    const result = await getParityBySize();

    expect(result).toHaveLength(1);
    expect(result[0]?.femaleRate).toBe(0.5);
  });

  it("getDepartmentPartyData falls back to live when snapshot missing", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    queryRawMock.mockResolvedValueOnce([
      { departmentCode: "75", departmentName: "Paris", partyLabel: "EELV", listCount: 3 },
      { departmentCode: "75", departmentName: "Paris", partyLabel: "PS", listCount: 1 },
    ]);

    const result = await getDepartmentPartyData();

    expect(result).toHaveLength(1);
    expect(result[0]?.dominantParty).toBe("EELV");
  });

  it("getParityOutliers returns empty fallback when snapshot missing AND election not found", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    electionFindUniqueMock.mockResolvedValueOnce(null);

    const result = await getParityOutliers();

    expect(result).toEqual({ best: [], worst: [] });
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it("getDepartmentPartyData returns empty array when snapshot missing AND election not found", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    electionFindUniqueMock.mockResolvedValueOnce(null);

    const result = await getDepartmentPartyData();

    expect(result).toEqual([]);
    expect(queryRawMock).not.toHaveBeenCalled();
  });
});
