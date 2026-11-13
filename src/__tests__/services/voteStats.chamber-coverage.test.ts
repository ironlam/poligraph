import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  vote: { groupBy: vi.fn() },
}));
const cacheTag = vi.hoisted(() => vi.fn());
const cacheLife = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ cacheTag, cacheLife }));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import { getPoliticianVoteChamberCoverage } from "@/services/voteStats";

describe("getPoliticianVoteChamberCoverage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads the denormalized Vote.chamber field without a Scrutin join", async () => {
    dbMock.vote.groupBy.mockResolvedValue([{ chamber: "AN" }, { chamber: "SENAT" }]);

    await expect(getPoliticianVoteChamberCoverage("politician-1")).resolves.toEqual([
      "AN",
      "SENAT",
    ]);
    expect(dbMock.vote.groupBy).toHaveBeenCalledWith({
      by: ["chamber"],
      where: { politicianId: "politician-1" },
    });
    expect(cacheTag).toHaveBeenCalledWith("votes", "politician-votes");
    expect(cacheLife).toHaveBeenCalledWith("synced");
  });

  it("returns an empty coverage when no vote is recorded", async () => {
    dbMock.vote.groupBy.mockResolvedValue([]);

    await expect(getPoliticianVoteChamberCoverage("politician-2")).resolves.toEqual([]);
  });
});
