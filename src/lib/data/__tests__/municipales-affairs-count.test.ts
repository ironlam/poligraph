import { beforeEach, describe, expect, it, vi } from "vitest";
import { ATTRIBUTION_ROWS } from "@/lib/affairs/__tests__/fixtures/attribution";
import { evaluateWhere } from "@/lib/affairs/__tests__/fixtures/evaluate-where";

const mocks = vi.hoisted(() => ({
  communeFindUnique: vi.fn(),
  electionFindUnique: vi.fn(),
  candidacyFindMany: vi.fn(),
  candidacyFindFirst: vi.fn(),
  affairGroupBy: vi.fn(),
  mandateFindFirst: vi.fn(),
  communeElectionRoundFindMany: vi.fn(),
}));

vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    commune: { findUnique: mocks.communeFindUnique },
    election: { findUnique: mocks.electionFindUnique },
    candidacy: { findMany: mocks.candidacyFindMany, findFirst: mocks.candidacyFindFirst },
    affair: { groupBy: mocks.affairGroupBy },
    mandate: { findFirst: mocks.mandateFindFirst },
    communeElectionRound: { findMany: mocks.communeElectionRoundFindMany },
  },
}));

import { getCommune } from "@/lib/data/municipales";

type Where = Record<string, unknown>;

const rows = ATTRIBUTION_ROWS.map((row) => ({ ...row, politicianId: "p1" }));

describe("fiche commune : « N affaires » à côté d'un candidat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.communeFindUnique.mockResolvedValue({ id: "00001", name: "Commune Test" });
    mocks.electionFindUnique.mockResolvedValue({
      id: "election-1",
      round1Date: new Date("2026-03-15"),
      round2Date: null,
    });
    mocks.candidacyFindMany.mockResolvedValue([
      {
        id: "c1",
        politicianId: "p1",
        listName: "Liste Test",
        listPosition: 1,
        partyLabel: null,
        round1Votes: null,
        round1Pct: null,
        round2Votes: null,
        round2Pct: null,
        candidate: { gender: "M" },
        politician: { id: "p1", slug: "elu-test", fullName: "Élu Test", mandates: [] },
      },
    ]);
    mocks.affairGroupBy.mockImplementation(async ({ where }: { where: Where }) => {
      const count = rows.filter((row) => evaluateWhere(row, where)).length;
      return count > 0 ? [{ politicianId: "p1", _count: count }] : [];
    });
    mocks.mandateFindFirst.mockResolvedValue(null);
    mocks.communeElectionRoundFindMany.mockResolvedValue([]);
  });

  it("ne compte que les affaires à charge, ni témoin, ni victime, ni mention", async () => {
    const commune = await getCommune("00001");

    const member = commune!.lists[0]!.members[0]!;
    expect(member.affairsCount).toBe(rows.filter((row) => row.expectedAdverse).length);
  });
});
