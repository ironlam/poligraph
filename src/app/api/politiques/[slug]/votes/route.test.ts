import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  getVotingStats: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    politician: { findUnique: mocks.findUnique },
    vote: { findMany: mocks.findMany, count: mocks.count },
  },
}));
vi.mock("@/services/voteStats", () => ({
  getPoliticianVotingStats: mocks.getVotingStats,
}));

import { GET } from "./route";

describe("GET /api/politiques/[slug]/votes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sérialise l'indisponibilité Sénat sans taux numérique", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "senateur-1",
      slug: "nathalie-delattre",
      fullName: "Nathalie Delattre",
      firstName: "Nathalie",
      lastName: "Delattre",
      photoUrl: null,
      currentParty: null,
    });
    mocks.findMany.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);
    mocks.getVotingStats.mockResolvedValue({
      total: 18,
      pour: 18,
      contre: 0,
      abstention: 0,
      nonVotant: 0,
      eligibleScrutins: null,
      scrutinsSansVoteEnregistre: null,
      participationRate: null,
      participationStatus: "SOURCE_INSUFFICIENT",
    });

    const response = await GET(
      new NextRequest("https://poligraph.fr/api/politiques/nathalie-delattre/votes"),
      { params: Promise.resolve({ slug: "nathalie-delattre" }) }
    );
    const payload = await response.json();

    expect(payload.stats.participationRate).toBeNull();
    expect(payload.stats.participationStatus).toBe("SOURCE_INSUFFICIENT");
    expect(typeof payload.stats.participationRate).not.toBe("number");
  });

  it("ne publie aucun taux quand les mandats parlementaires courants sont ambigus", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "mandats-ambigus",
      slug: "mandats-ambigus",
      fullName: "Mandats ambigus",
      firstName: "Mandats",
      lastName: "Ambigus",
      photoUrl: null,
      currentParty: null,
    });
    mocks.findMany.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);
    mocks.getVotingStats.mockResolvedValue({
      total: 12,
      pour: 10,
      contre: 2,
      abstention: 0,
      nonVotant: 0,
      eligibleScrutins: null,
      scrutinsSansVoteEnregistre: null,
      participationRate: null,
      participationStatus: "COMPUTATION_INCOMPLETE",
    });

    const response = await GET(
      new NextRequest("https://poligraph.fr/api/politiques/mandats-ambigus/votes"),
      { params: Promise.resolve({ slug: "mandats-ambigus" }) }
    );
    const payload = await response.json();

    expect(payload.stats).toMatchObject({
      participationRate: null,
      participationStatus: "COMPUTATION_INCOMPLETE",
    });
    expect(typeof payload.stats.participationRate).not.toBe("number");
  });
});
