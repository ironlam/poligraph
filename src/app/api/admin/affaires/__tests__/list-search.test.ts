import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  db: {
    affair: { findMany: vi.fn(), count: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/cache", () => ({ invalidateEntity: vi.fn() }));
vi.mock("@/lib/affair-matching", () => ({ resolveAffairPolitician: vi.fn() }));
vi.mock("@/lib/api/with-admin-auth", () => ({
  withAdminAuth: (fn: (req: unknown, ctx: unknown) => unknown) => (req: unknown, ctx: unknown) =>
    fn(req, ctx),
}));

import { GET } from "@/app/api/admin/affaires/route";

async function search(term: string) {
  const url = `https://poligraph.test/api/admin/affaires?search=${encodeURIComponent(term)}`;
  await GET(new NextRequest(url), { params: Promise.resolve({}) });
  return h.db.affair.findMany.mock.calls[0]![0].where;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.db.affair.findMany.mockResolvedValue([]);
  h.db.affair.count.mockResolvedValue(0);
});

describe("GET /api/admin/affaires : recherche", () => {
  it("cherche une affaire par son identifiant public, sans tenir compte de la casse", async () => {
    const where = await search(" af-000609 ");

    expect(where.publicId).toBe("AF-000609");
    expect(where.OR).toBeUndefined();
  });

  it("garde la recherche par titre et politicien pour un texte libre", async () => {
    const where = await search("Mediapart");

    expect(where.publicId).toBeUndefined();
    expect(where.OR).toEqual([
      { title: { contains: "Mediapart", mode: "insensitive" } },
      { politician: { fullName: { contains: "Mediapart", mode: "insensitive" } } },
    ]);
  });

  it("ne traite pas l'identifiant d'une autre entité comme une affaire", async () => {
    const where = await search("PG-000542");

    expect(where.publicId).toBeUndefined();
    expect(where.OR).toBeDefined();
  });
});
