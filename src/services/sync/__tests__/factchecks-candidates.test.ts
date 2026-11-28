import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  politicianFindMany: vi.fn(),
  candidacyFindMany: vi.fn(),
  searchClaims: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    politician: { findMany: h.politicianFindMany },
    candidacy: { findMany: h.candidacyFindMany },
  },
}));
vi.mock("@/lib/elections/election-id", () => ({
  getElectionIdBySlug: async () => "election-2027",
}));
vi.mock("@/services/classify-theme", () => ({ classifyFactCheckTheme: vi.fn() }));
vi.mock("@/lib/api", () => ({
  searchClaims: h.searchClaims,
  mapTextualRating: () => "FALSE",
  fetchPageTitle: vi.fn(),
}));
vi.mock("@/lib/name-matching", () => ({
  normalizeText: (s: string) => s.toLowerCase(),
  buildPoliticianIndex: async () => [
    {
      id: "p1",
      fullName: "Camille Exemple",
      normalizedFullName: "camille exemple",
      normalizedLastName: "exemple",
    },
  ],
  findMentions: () => [],
}));
vi.mock("@/lib/identity/mention-blocklist", () => ({
  loadMentionBlocklist: async () => ({ isBlocked: () => false }),
}));
vi.mock("@/lib/sync", () => ({
  syncMetadata: { get: vi.fn().mockResolvedValue(null), set: vi.fn() },
}));
vi.mock("@/lib/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/utils")>()),
  sleep: async () => {},
}));
vi.mock("@/lib/politicians/profile-snapshot/request", () => ({
  requestProfileRefresh: vi.fn(),
}));

import {
  CANDIDATE_SEARCH_MAX_AGE_DAYS,
  syncFactchecks,
  withDeclaredCandidates,
} from "../factchecks";

const pooled = { id: "pool-1", fullName: "Élu Du Pool" };
const candidateInPool = { id: "cand-in", fullName: "Candidate Au Pool" };
const candidateOutside = { id: "cand-out", fullName: "Candidat Sans Mandat" };

describe("withDeclaredCandidates", () => {
  it("appends candidates outside the window with the recent-only limit", () => {
    const targets = withDeclaredCandidates(
      [pooled, candidateInPool],
      [candidateInPool, candidateOutside]
    );
    expect(targets).toEqual([
      pooled,
      candidateInPool,
      { ...candidateOutside, maxAgeDays: CANDIDATE_SEARCH_MAX_AGE_DAYS },
    ]);
  });

  it("searches a politician with two candidacies once", () => {
    const targets = withDeclaredCandidates([], [candidateOutside, candidateOutside]);
    expect(targets).toHaveLength(1);
  });
});

describe("syncFactchecks searches declared candidates on cron runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.searchClaims.mockResolvedValue([]);
    h.politicianFindMany.mockResolvedValue([pooled, candidateInPool]);
    h.candidacyFindMany.mockResolvedValue([
      { politician: candidateInPool },
      { politician: candidateOutside },
    ]);
  });

  it("searches a candidate with no mandate, limited to recent reviews", async () => {
    const stats = await syncFactchecks({ limit: 50 });

    expect(h.searchClaims).toHaveBeenCalledWith(candidateOutside.fullName, {
      maxAgeDays: CANDIDATE_SEARCH_MAX_AGE_DAYS,
    });
    expect(stats.candidatesSearched).toBe(1);
    expect(stats.politiciansSearched).toBe(3);
  });

  it("keeps the full-stock search for a candidate already in the rotation window", async () => {
    await syncFactchecks({ limit: 50 });

    const calls = h.searchClaims.mock.calls.filter(([name]) => name === candidateInPool.fullName);
    expect(calls).toEqual([[candidateInPool.fullName, undefined]]);
  });

  it("does not add candidates to a search for one named politician", async () => {
    const stats = await syncFactchecks({ politician: "exemple" });

    expect(h.candidacyFindMany).not.toHaveBeenCalled();
    expect(stats.candidatesSearched).toBe(0);
  });
});
