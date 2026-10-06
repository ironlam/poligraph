import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  db: { affair: { findMany: vi.fn(), findUnique: vi.fn() } },
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/api/with-admin-auth", () => ({
  withAdminAuth: (fn: (req: unknown, ctx: unknown) => unknown) => (req: unknown, ctx: unknown) =>
    fn(req, ctx),
}));

import { GET } from "./route";

async function search(params: Record<string, string>) {
  const url = `https://poligraph.test/api/admin/affaires/search?${new URLSearchParams(params)}`;
  await GET(new NextRequest(url), { params: Promise.resolve({}) });
  return h.db.affair.findMany.mock.calls[0]![0].where;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.db.affair.findMany.mockResolvedValue([]);
});

describe("GET /api/admin/affaires/search", () => {
  it("cherche une affaire par son identifiant public, sans tenir compte de la casse", async () => {
    const where = await search({ q: "af-000609", excludeId: "aff-1" });

    expect(where).toEqual({ publicId: "AF-000609", id: { not: "aff-1" } });
  });

  it("garde la recherche par titre pour un texte libre", async () => {
    const where = await search({ q: "Mediapart" });

    expect(where).toEqual({ title: { contains: "Mediapart", mode: "insensitive" } });
  });

  it("ne traite pas l'identifiant d'une autre entité comme une affaire", async () => {
    const where = await search({ q: "PG-000542" });

    expect(where).toEqual({ title: { contains: "PG-000542", mode: "insensitive" } });
  });
});
