import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@/generated/prisma";

vi.mock("@/lib/db", () => ({
  db: {
    candidacy: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

const getElectionIdBySlug = vi.hoisted(() => vi.fn());
vi.mock("@/lib/elections/election-id", () => ({ getElectionIdBySlug }));

import { db } from "@/lib/db";
import {
  getCandidates2027ForModeration,
  getCandidateCrossCycle,
  getCandidateRound1Pct,
} from "@/lib/data/candidates";

beforeEach(() => {
  vi.clearAllMocks();
  getElectionIdBySlug.mockResolvedValue("election-2027");
});

describe("CandidacyPresidential schema", () => {
  it("declares CandidacyPresidential in the Prisma ModelName enum", () => {
    expect(Prisma.ModelName).toHaveProperty("CandidacyPresidential");
  });
});

describe("getCandidates2027ForModeration", () => {
  it("queries presidentielle-2027 candidacies sorted by rank then lastName", async () => {
    vi.mocked(db.candidacy.findMany).mockResolvedValueOnce([] as never);
    await getCandidates2027ForModeration();
    expect(getElectionIdBySlug).toHaveBeenCalledExactlyOnceWith("presidentielle-2027");
    expect(db.candidacy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { electionId: "election-2027" },
      })
    );
  });

  it("returns nothing, without reading Candidacy, when the election does not exist", async () => {
    getElectionIdBySlug.mockResolvedValue(null);
    expect(await getCandidates2027ForModeration()).toEqual([]);
    expect(db.candidacy.findMany).not.toHaveBeenCalled();
  });
});

describe("getCandidateCrossCycle", () => {
  it("excludes the current cycle when listing past presidential candidacies", async () => {
    vi.mocked(db.candidacy.findMany).mockResolvedValueOnce([] as never);
    await getCandidateCrossCycle("politician-id", "presidentielle-2027");
    expect(db.candidacy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          politicianId: "politician-id",
          election: { type: "PRESIDENTIELLE", slug: { not: "presidentielle-2027" } },
        }),
      })
    );
  });

  it("preserves round1Pct = 0 instead of mapping to null (regression)", async () => {
    vi.mocked(db.candidacy.findMany).mockResolvedValueOnce([
      {
        id: "c2",
        round1Pct: { toString: () => "0", valueOf: () => 0 } as never,
        election: {
          slug: "presidentielle-2022",
          title: "Présidentielle 2022",
          round1Date: new Date("2022-04-10"),
        },
      },
    ] as never);
    const result = await getCandidateCrossCycle("p1", "presidentielle-2027");
    expect(result[0]?.round1Pct).toBe(0);
  });

  it("converts Decimal round1Pct to number for serialization", async () => {
    vi.mocked(db.candidacy.findMany).mockResolvedValueOnce([
      {
        id: "c1",
        round1Pct: { toString: () => "21.95", valueOf: () => 21.95 } as never,
        election: {
          slug: "presidentielle-2022",
          title: "Présidentielle 2022",
          round1Date: new Date("2022-04-10"),
        },
      },
    ] as never);
    const result = await getCandidateCrossCycle("p1", "presidentielle-2027");
    expect(result).toHaveLength(1);
    expect(typeof result[0]?.round1Pct).toBe("number");
    expect(result[0]?.round1Pct).toBeCloseTo(21.95);
  });
});

describe("getCandidateRound1Pct", () => {
  it("returns null when no round1Pct is recorded", async () => {
    vi.mocked(db.candidacy.findUnique).mockResolvedValueOnce({ round1Pct: null } as never);
    const pct = await getCandidateRound1Pct("cand-id");
    expect(pct).toBeNull();
  });

  it("returns the percentage as a plain number when present", async () => {
    vi.mocked(db.candidacy.findUnique).mockResolvedValueOnce({
      round1Pct: { toString: () => "27.85", valueOf: () => 27.85 } as never,
    } as never);
    const pct = await getCandidateRound1Pct("cand-id");
    expect(pct).toBeCloseTo(27.85);
  });
});
