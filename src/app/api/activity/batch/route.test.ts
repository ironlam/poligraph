import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { politicianFindMany, voteFindMany, voteCount, affairFindMany } = vi.hoisted(() => ({
  politicianFindMany: vi.fn(),
  voteFindMany: vi.fn(),
  voteCount: vi.fn(),
  affairFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    politician: { findMany: politicianFindMany },
    vote: { findMany: voteFindMany, count: voteCount },
    affair: { findMany: affairFindMany },
    party: { findMany: vi.fn().mockResolvedValue([]) },
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
