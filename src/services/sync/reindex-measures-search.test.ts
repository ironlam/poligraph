import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  count: vi.fn(),
  reindexMeasures: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { measure: { count: h.count } } }));
vi.mock("@/lib/search/maintenance", () => ({ reindexMeasures: h.reindexMeasures }));

import { reindexPresidentialMeasureSearch } from "./reindex-measures-search";

describe("reindexPresidentialMeasureSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.count.mockResolvedValue(605);
    h.reindexMeasures.mockResolvedValue({
      entityType: "MEASURE",
      processed: 605,
      batches: 7,
      lastId: "measure-605",
    });
  });

  it("borne la reconstruction à la présidentielle 2027", async () => {
    await expect(reindexPresidentialMeasureSearch()).resolves.toEqual({
      electionSlug: "presidentielle-2027",
      total: 605,
      processed: 605,
      batches: 7,
      lastId: "measure-605",
    });
    expect(h.count).toHaveBeenCalledWith({
      where: { election: { slug: "presidentielle-2027" } },
    });
    expect(h.reindexMeasures).toHaveBeenCalledWith({
      electionSlug: "presidentielle-2027",
      batchSize: 100,
    });
  });
});
