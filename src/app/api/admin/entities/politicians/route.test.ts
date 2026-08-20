import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  db: {
    $queryRaw: vi.fn(),
    politician: { findMany: vi.fn(), findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/api/with-admin-auth", () => ({
  withAdminAuth: (handler: (request: NextRequest) => Promise<Response>) => handler,
}));

import { GET } from "./route";

const context = { params: Promise.resolve({}) };

const politician = {
  id: "p-1",
  fullName: "François Fillon",
  slug: "francois-fillon",
  publicationStatus: "PUBLISHED",
  currentParty: { shortName: "LR", name: "Les Républicains" },
  mandates: [
    {
      type: "DEPUTE",
      title: "Député",
      institution: "Assemblée nationale",
      constituency: "Sarthe (2ème)",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  h.db.$queryRaw.mockResolvedValue([{ id: "p-1" }]);
  h.db.politician.findMany.mockResolvedValue([politician]);
  h.db.politician.findUnique.mockResolvedValue(politician);
});

describe("GET /api/admin/entities/politicians", () => {
  it("returns at most 20 contextualized results", async () => {
    const response = await GET(
      new NextRequest("https://poligraph.fr/api/admin/entities/politicians?q=francois&limit=20"),
      context
    );
    const body = await response.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toMatchObject({
      id: "p-1",
      fullName: "François Fillon",
      slug: "francois-fillon",
      publicationStatus: "PUBLISHED",
      party: { shortName: "LR", name: "Les Républicains" },
      mandate: { type: "DEPUTE", institution: "Assemblée nationale" },
    });
    expect(h.db.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("resolves the current value by id without searching the corpus", async () => {
    const response = await GET(
      new NextRequest("https://poligraph.fr/api/admin/entities/politicians?id=p-1"),
      context
    );
    expect(await response.json()).toMatchObject({ result: { id: "p-1", slug: "francois-fillon" } });
    expect(h.db.politician.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p-1" } })
    );
    expect(h.db.$queryRaw).not.toHaveBeenCalled();
  });

  it("rejects invalid or underspecified parameters", async () => {
    expect(
      (
        await GET(
          new NextRequest("https://poligraph.fr/api/admin/entities/politicians?limit=21"),
          context
        )
      ).status
    ).toBe(400);
    await expect(
      (
        await GET(
          new NextRequest("https://poligraph.fr/api/admin/entities/politicians?q=f"),
          context
        )
      ).json()
    ).resolves.toMatchObject({ results: [] });
    expect(h.db.$queryRaw).not.toHaveBeenCalled();
  });

  it("passes the accent-tolerant search term through the parameterized query", async () => {
    await GET(
      new NextRequest("https://poligraph.fr/api/admin/entities/politicians?q=François"),
      context
    );
    expect(h.db.$queryRaw.mock.calls[0]?.[0]).toBeDefined();
  });
});
