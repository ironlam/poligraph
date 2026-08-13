import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getVoteStats = vi.hoisted(() => vi.fn());

vi.mock("@/services/voteStats", () => ({
  voteStatsService: { getVoteStats },
}));

import { GET } from "./route";

const context = { params: Promise.resolve({}) };

function statsFor(status: "SOURCE_INSUFFICIENT" | "COMPUTATION_INCOMPLETE") {
  return {
    parties: [
      {
        partyId: "p1",
        participationRate: null,
        participationStatus: status,
      },
    ],
    divisiveScrutins: [],
    global: {
      totalScrutins: 2,
      totalVotesFor: 3,
      totalVotesAgainst: 1,
      totalVotesAbstain: 1,
      participationRate: null,
      participationStatus: status,
      anScrutins: 1,
      senatScrutins: 1,
      adoptes: 1,
      rejetes: 1,
    },
  };
}

describe("GET /api/votes/stats", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["", undefined, "COMPUTATION_INCOMPLETE"],
    ["?chamber=AN", "AN", "COMPUTATION_INCOMPLETE"],
    ["?chamber=SENAT", "SENAT", "SOURCE_INSUFFICIENT"],
  ] as const)("fail closed pour %s", async (query, chamber, status) => {
    getVoteStats.mockResolvedValue(statsFor(status));

    const response = await GET(
      new NextRequest(`https://poligraph.fr/api/votes/stats${query}`),
      context
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(getVoteStats).toHaveBeenCalledWith(chamber, {
      partyLimit: 20,
      divisiveLimit: 20,
    });
    expect(payload.global.participationRate).toBeNull();
    expect(payload.global.participationStatus).toBe(status);
    expect(payload.parties[0].participationRate).toBeNull();
  });

  it("retourne 400 pour une chambre invalide", async () => {
    const response = await GET(
      new NextRequest("https://poligraph.fr/api/votes/stats?chamber=INVALID"),
      context
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Chambre invalide" });
    expect(getVoteStats).not.toHaveBeenCalled();
  });
});
