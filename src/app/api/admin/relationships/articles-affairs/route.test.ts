import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  getWorkbench: vi.fn(),
  mutate: vi.fn(),
  auth: vi.fn(),
}));
vi.mock("@/services/admin/article-affair-workbench", () => ({
  getArticleWorkbench: h.getWorkbench,
  mutateArticleAffairRelation: h.mutate,
  ARTICLE_AFFAIR_ROLES: ["REVELATION", "UPDATE", "MENTION"],
  RelationshipConflictError: class RelationshipConflictError extends Error {},
}));
vi.mock("@/lib/api/with-admin-auth", () => ({ withAdminAuth: (handler: unknown) => handler }));

import { GET, POST } from "./route";

const context = { params: Promise.resolve({}) };

beforeEach(() => vi.clearAllMocks());

describe("article-affair relationship route", () => {
  it("returns a bounded authenticated workbench context", async () => {
    h.getWorkbench.mockResolvedValue({
      snapshot: { articleVersion: "2026-01-01T00:00:00.000Z", relationsHash: "a".repeat(64) },
    });
    const response = await GET(
      new NextRequest(
        "https://poligraph.fr/api/admin/relationships/articles-affairs?articleId=article-1"
      ),
      context
    );
    expect(response.status).toBe(200);
    expect(h.getWorkbench).toHaveBeenCalledWith("article-1");
  });

  it("rejects invalid justification before calling the mutation service", async () => {
    const response = await POST(
      new NextRequest("https://poligraph.fr/api/admin/relationships/articles-affairs", {
        method: "POST",
        body: JSON.stringify({
          operation: "LINK",
          articleId: "a",
          affairId: "f",
          role: "MENTION",
          justification: "court",
          expected: { articleVersion: "2026-01-01T00:00:00.000Z", relationsHash: "a".repeat(64) },
        }),
        headers: { "content-type": "application/json" },
      }),
      context
    );
    expect(response.status).toBe(400);
    expect(h.mutate).not.toHaveBeenCalled();
  });
});
