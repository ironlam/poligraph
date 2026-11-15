import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  scrutins: vi.fn(),
  politicians: vi.fn(),
  votes: vi.fn(),
  groupBy: vi.fn(),
}));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    scrutin: { findMany: h.scrutins },
    politician: { findMany: h.politicians },
    vote: { findMany: h.votes, groupBy: h.groupBy },
  },
}));

import { getVotesDeputesDepartement } from "@/lib/data/territoire-votes";

const scrutin = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  slug: "2026-11-12-budget",
  title: "l'ensemble du projet de loi de finances",
  type: "FINAL",
  votingDate: new Date("2026-11-12T00:00:00Z"),
  result: "REJECTED",
  votesFor: 0,
  votesAgainst: 1,
  votesAbstain: 0,
  chamber: "AN",
  sourceUrl: null,
  policyTitle: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.politicians.mockResolvedValue([
    { id: "p1", slug: "depute-un", mandates: [{ startDate: new Date("2024-07-08") }] },
    { id: "p2", slug: "depute-deux", mandates: [{ startDate: new Date("2024-07-08") }] },
    { id: "p3", slug: "depute-recent", mandates: [{ startDate: new Date("2026-11-13") }] },
  ]);
  h.groupBy.mockResolvedValue([{ scrutinId: "s1", position: "CONTRE", _count: { _all: 1 } }]);
  h.votes.mockResolvedValue([{ scrutinId: "s1", politicianId: "p1", position: "CONTRE" }]);
});

describe("getVotesDeputesDepartement", () => {
  it("prend les trois derniers scrutins FINAL ou MOTION de l'Assemblée, sans autre critère", async () => {
    h.scrutins.mockResolvedValueOnce([scrutin()]);
    await getVotesDeputesDepartement("29");
    const args = h.scrutins.mock.calls[0]?.[0];
    expect(args.where).toEqual({
      chamber: "AN",
      type: { in: ["FINAL", "MOTION"] },
      slug: { not: null },
    });
    expect(args.take).toBe(3);
    expect(args.orderBy).toEqual([{ votingDate: "desc" }, { sequence: "desc" }]);
  });

  it("n'utilise pas isKeyVote", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/data/territoire-votes.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(source).not.toContain("isKeyVote");
  });

  it("garde le titre officiel sans titre approuvé, et le titre explicatif une fois approuvé", async () => {
    const policy = {
      policyTitle: "L'Assemblée rejette le budget",
      policySubtitle: null,
      officialSourceUrl: null,
      proceduralLabel: "Scrutin",
    };
    h.scrutins.mockResolvedValueOnce([
      scrutin(),
      scrutin({ id: "s2", slug: "b", policyTitle: { ...policy, status: "NEEDS_REVIEW" } }),
      scrutin({ id: "s3", slug: "c", policyTitle: { ...policy, status: "APPROVED" } }),
    ]);
    const { scrutins } = await getVotesDeputesDepartement("29");
    expect(scrutins[0]?.titre).toBe("l'ensemble du projet de loi de finances");
    expect(scrutins[1]?.titre).toBe("l'ensemble du projet de loi de finances");
    expect(scrutins[2]?.titre).toBe("L'Assemblée rejette le budget");
    expect(scrutins[0]).toMatchObject({
      nature: "Texte final",
      resultat: "Rejeté",
      date: "2026-11-12",
    });
  });

  it("rend les positions par député, et rien pour celui qui n'en a pas", async () => {
    h.scrutins.mockResolvedValueOnce([scrutin()]);
    const votes = await getVotesDeputesDepartement("29");
    expect(votes.deputeSlugs).toEqual(["depute-un", "depute-deux", "depute-recent"]);
    expect(votes.scrutins[0]?.positions).toEqual({ "depute-un": "CONTRE" });
    expect(h.politicians.mock.calls[0]?.[0].where).toMatchObject({
      publicationStatus: expect.anything(),
      mandates: { some: { type: "DEPUTE", isCurrent: true, departmentCode: "29" } },
    });
  });

  it("n'établit « n'a pas voté » que si les positions recoupent les totaux officiels", async () => {
    h.scrutins.mockResolvedValueOnce([scrutin()]);
    const complet = await getVotesDeputesDepartement("29");
    // Seated on the day and without an entry: did not vote. Elected the day after: unknown.
    expect(complet.scrutins[0]?.sansVote).toEqual(["depute-deux"]);

    h.scrutins.mockResolvedValueOnce([scrutin({ votesAgainst: 40 })]);
    const incomplet = await getVotesDeputesDepartement("29");
    expect(incomplet.scrutins[0]?.sansVote).toEqual([]);
  });
});
