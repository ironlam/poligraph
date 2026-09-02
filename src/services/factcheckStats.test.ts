import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  groupBy: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    factCheck: { count: mocks.count, groupBy: mocks.groupBy },
    $queryRaw: mocks.queryRaw,
  },
}));

import { factcheckStatsService } from "./factcheckStats";

describe("statistiques publiques des fact-checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.count.mockResolvedValue(0);
    mocks.groupBy.mockResolvedValue([]);
    mocks.queryRaw.mockResolvedValue([]);
  });

  it("aplatit le prédicat public dans la requête Prisma au lieu de le lier comme une valeur", async () => {
    await factcheckStatsService.getStatisticsData();

    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    const call = mocks.queryRaw.mock.calls[0] ?? [];
    expect(call).toHaveLength(1);
    expect(call[0]).toMatchObject({
      sql: expect.stringContaining('fc."publicationStatus" = ?'),
      values: expect.arrayContaining(["PUBLISHED"]),
    });
    expect(call[0].values.every((value: unknown) => typeof value !== "object")).toBe(true);
  });
});
