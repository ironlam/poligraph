import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  get: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/api/http-client", () => ({
  HTTPClient: class {
    get = h.get;
  },
}));
vi.mock("@/lib/db", () => ({
  db: { externalId: { findMany: h.findMany }, politician: { update: h.update } },
}));

import { syncDeceasedFromWikidata } from "../deceased";

describe("syncDeceasedFromWikidata : taille des lots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("interroge Wikidata par lots de 200 et applique les dates trouvées", async () => {
    h.findMany.mockResolvedValue(
      Array.from({ length: 450 }, (_, i) => ({
        externalId: `Q${i + 1}`,
        politicianId: `p${i + 1}`,
        politician: { fullName: `Nom ${i + 1}` },
      }))
    );
    // Q450 sits in the third and last batch.
    h.get.mockImplementation(async (url: string) => ({
      data: {
        results: {
          bindings: /wd:Q450\b/.test(decodeURIComponent(url))
            ? [
                {
                  person: { value: "http://www.wikidata.org/entity/Q450" },
                  deathDate: { value: "2026-10-26T00:00:00Z" },
                },
              ]
            : [],
        },
      },
    }));

    const result = await syncDeceasedFromWikidata();

    // 450 ids: three queries of at most 200, where batches of 50 took nine.
    expect(h.get).toHaveBeenCalledTimes(3);
    for (const [url] of h.get.mock.calls) {
      expect(
        (decodeURIComponent(url as string).match(/wd:Q\d+/g) ?? []).length
      ).toBeLessThanOrEqual(200);
      expect((url as string).length).toBeLessThan(4000);
    }
    expect(result).toMatchObject({ success: true, checked: 450, updated: 1 });
    expect(h.update).toHaveBeenCalledWith({
      where: { id: "p450" },
      data: { deathDate: new Date("2026-10-26T00:00:00Z") },
    });
  });
});
