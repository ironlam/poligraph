import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ count: vi.fn(), cacheTag: vi.fn() }));

vi.mock("next/cache", () => ({ cacheTag: mocks.cacheTag, cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { politician: { count: mocks.count } } }));

import { PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";
import { getPartySeatCounts } from "@/lib/data/partis";

describe("getPartySeatCounts", () => {
  beforeEach(() => {
    mocks.count.mockReset();
    mocks.cacheTag.mockClear();
  });

  it("counts people, one question per chamber, among current public members", async () => {
    mocks.count.mockImplementation(({ where }) => {
      const seats = { DEPUTE: 12, SENATEUR: 4, DEPUTE_EUROPEEN: 0 };
      return Promise.resolve(seats[where.mandates.some.type as keyof typeof seats]);
    });

    await expect(getPartySeatCounts("party-1")).resolves.toEqual({
      deputes: 12,
      senateurs: 4,
      deputesEuropeens: 0,
    });
    expect(mocks.count).toHaveBeenCalledTimes(3);
    for (const [{ where }] of mocks.count.mock.calls) {
      expect(where).toMatchObject({ ...PUBLIC_POLITICIAN_WHERE, currentPartyId: "party-1" });
      expect(where.mandates.some.isCurrent).toBe(true);
    }
  });

  it("goes stale with the party and with its members", async () => {
    mocks.count.mockResolvedValue(0);
    await getPartySeatCounts("party-1");
    expect(mocks.cacheTag).toHaveBeenCalledWith("party-seats:party-1", "parties", "politicians");
  });
});
