import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  findUnique: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { affair: mocks, election: mocks, $queryRaw: mocks.queryRaw } }));

import { getPresidentialAffairs } from "./presidentielle-affaires";

describe("getPresidentialAffairs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ne retourne que les affaires publiques rattachées à des candidatures sourcées", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "affair-1",
        slug: "affair-1",
        title: "Affaire documentée",
        description: "Description sourcée",
        status: "INSTRUCTION",
        involvement: "DIRECT",
        involvementNote: null,
        category: "CORRUPTION",
        verdictDate: null,
        startDate: new Date("2026-01-01"),
        factsDate: null,
        sentence: null,
        fineAmount: { toString: () => "1200.50" },
        sources: [{ id: "source-1" }],
        _count: { sources: 1 },
        partyAtTime: null,
        politician: {
          slug: "jean-dupont",
          fullName: "Jean Dupont",
          currentParty: null,
          candidacies: [
            {
              candidateName: "Jean Dupont",
              status: "DECLARE",
              sourceUrl: "https://example.org/candidature",
              sourceLabel: "Source officielle",
            },
          ],
        },
      },
    ]);
    mocks.count.mockResolvedValue(1);
    mocks.findUnique.mockResolvedValue({ id: "election-2027" });
    mocks.queryRaw.mockResolvedValue([{ id: "affair-1" }]);

    const result = await getPresidentialAffairs("presidentielle-2027");

    expect(result.total).toBe(1);
    expect(result.affairs[0]).toMatchObject({
      title: "Affaire documentée",
      fineAmount: 1200.5,
      candidates: [
        {
          name: "Jean Dupont",
          sourceUrl: "https://example.org/candidature",
        },
      ],
    });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.any(Object) })
    );
    const args = mocks.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(JSON.stringify(args.where)).toContain('"electionId":"election-2027"');
    expect(JSON.stringify(args.where)).toContain('"sourceUrl":{"not":null}');
    expect(mocks.queryRaw).toHaveBeenCalled();
  });
});
