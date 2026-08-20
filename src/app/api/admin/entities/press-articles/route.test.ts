import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  db: { pressArticle: { findMany: vi.fn(), findUnique: vi.fn() } },
}));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/api/with-admin-auth", () => ({ withAdminAuth: (handler: unknown) => handler }));

import { GET } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/admin/entities/press-articles", () => {
  it("returns contextualized results with a maximum of 20", async () => {
    h.db.pressArticle.findMany.mockResolvedValue([]);
    const response = await GET(
      new NextRequest("https://poligraph.fr/api/admin/entities/press-articles?q=AFP&limit=20"),
      { params: Promise.resolve({}) }
    );
    expect(response.status).toBe(200);
    expect(h.db.pressArticle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 21, skip: 0 })
    );
    expect(h.db.pressArticle.findMany.mock.calls[0]?.[0].select._count.select).toEqual({
      mentions: true,
      affairLinks: true,
    });
  });

  it("resolves one article and rejects a limit above the bound", async () => {
    h.db.pressArticle.findUnique.mockResolvedValue({ id: "article-1" });
    const resolved = await GET(
      new NextRequest("https://poligraph.fr/api/admin/entities/press-articles?id=article-1"),
      { params: Promise.resolve({}) }
    );
    expect(await resolved.json()).toEqual({ result: { id: "article-1" } });
    const invalid = await GET(
      new NextRequest("https://poligraph.fr/api/admin/entities/press-articles?q=AFP&limit=21"),
      { params: Promise.resolve({}) }
    );
    expect(invalid.status).toBe(400);
  });
});
