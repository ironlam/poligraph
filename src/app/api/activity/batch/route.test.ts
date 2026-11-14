import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { politicianFindMany, voteFindMany, voteCount, affairFindMany, partyFindMany, queryRaw } =
  vi.hoisted(() => ({
    politicianFindMany: vi.fn(),
    voteFindMany: vi.fn(),
    voteCount: vi.fn(),
    affairFindMany: vi.fn(),
    partyFindMany: vi.fn(),
    queryRaw: vi.fn(),
  }));

vi.mock("@/lib/db", () => ({
  db: {
    politician: { findMany: politicianFindMany },
    vote: { findMany: voteFindMany, count: voteCount },
    affair: { findMany: affairFindMany },
    party: { findMany: partyFindMany },
    $queryRaw: queryRaw,
  },
}));

import { POST } from "./route";

const call = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/activity/batch", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({}) }
  );

describe("POST /api/activity/batch, fiches non publiées", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    voteFindMany.mockResolvedValue([]);
    affairFindMany.mockResolvedValue([]);
    partyFindMany.mockResolvedValue([]);
  });

  it("résout les slugs avec le périmètre public", async () => {
    politicianFindMany.mockResolvedValue([]);

    await call({ slugs: ["brouillon-16e"] });

    expect(politicianFindMany.mock.calls[0]?.[0].where).toMatchObject({
      slug: { in: ["brouillon-16e"] },
      publicationStatus: "PUBLISHED",
    });
  });

  it("ne lit aucun vote quand le slug demandé est un brouillon", async () => {
    politicianFindMany.mockResolvedValue([]);

    const response = await call({ slugs: ["brouillon-16e"] });
    const body = await response.json();

    expect(voteFindMany).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toContain("brouillon-16e");
  });
});

describe("POST /api/activity/batch, partis suivis", () => {
  const party = (id: string, slug: string | null) => ({
    id,
    slug,
    name: `Parti ${id}`,
    shortName: id.toUpperCase(),
    color: null,
    _count: { partyMemberships: 3 },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    partyFindMany.mockResolvedValue([]);
  });

  it("compte les votes de tous les partis en une seule requête groupée", async () => {
    partyFindMany.mockResolvedValue([party("p1", "un"), party("p2", "deux"), party("p3", null)]);
    queryRaw.mockResolvedValue([{ partyId: "p2", count: 4 }]);

    const response = await call({ partySlugs: ["un", "deux"] });
    const body = await response.json();

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(voteCount).not.toHaveBeenCalled();
    const sql = queryRaw.mock.calls[0]![0];
    // Only parties with a slug are counted, and only published politicians' votes.
    expect(sql.values).toEqual(expect.arrayContaining(["p1", "p2", "PUBLISHED"]));
    expect(sql.values).not.toContain("p3");
    const updates = body.activity.filter((a: { type: string }) => a.type === "party-update");
    expect(updates).toHaveLength(1);
    expect(updates[0].party.slug).toBe("deux");
    expect(updates[0].data.scrutinCount).toBe(4);
  });

  it("ne lance pas la requête quand aucun parti suivi n'est résolu", async () => {
    await call({ partySlugs: ["inconnu"] });

    expect(queryRaw).not.toHaveBeenCalled();
  });
});
