import { describe, it, expect, vi, beforeEach } from "vitest";

// Issue #525 — the admin merge route no longer carries its own merge logic. It
// checks the HTTP contract and delegates, so cache invalidation can only happen
// after the service transaction committed.

const order: string[] = [];

const h = vi.hoisted(() => ({
  mergeAffairs: vi.fn(),
  invalidateEntity: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/services/affairs/reconciliation", () => ({ mergeAffairs: h.mergeAffairs }));
vi.mock("@/lib/cache", () => ({ invalidateEntity: h.invalidateEntity }));
vi.mock("@/lib/db", () => ({ db: { affair: { findUnique: h.findUnique } } }));
vi.mock("@/lib/api/with-admin-auth", () => ({
  withAdminAuth: (fn: (req: unknown, ctx: unknown) => unknown) => (req: unknown, ctx: unknown) =>
    fn(req, ctx),
}));
vi.mock("@/lib/security", () => ({
  withValidation:
    (_s: unknown, fn: (req: unknown, ctx: unknown, body: unknown) => unknown) =>
    async (req: { json: () => Promise<unknown> }, ctx: unknown) =>
      fn(req, ctx, await req.json()),
  getRequestMeta: () => ({ ip: "203.0.113.1", userAgent: "test-agent" }),
}));

import { POST } from "@/app/api/admin/affaires/merge/route";

// The merge route takes no dynamic segment, but the wrapper still expects a context.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx: any = { params: Promise.resolve({}) };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function req(body: unknown): any {
  return new Request("http://test/api", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  h.mergeAffairs.mockImplementation(async () => {
    order.push("merge");
    return {
      sourcesMoved: 2,
      eventsMoved: 1,
      articlesMoved: 0,
      identifiersMerged: ["court"],
      slugsPreserved: ["absorbee"],
    };
  });
  h.invalidateEntity.mockImplementation(() => {
    order.push("invalidate");
  });
});

describe("POST /api/admin/affaires/merge — issue #525", () => {
  it("rejects merging an affair into itself", async () => {
    const res = await POST(req({ primaryId: "a", secondaryId: "a" }), ctx);

    expect(res.status).toBe(400);
    expect(h.mergeAffairs).not.toHaveBeenCalled();
  });

  it("returns 404 when either affair is missing", async () => {
    h.findUnique.mockResolvedValueOnce({ id: "a", politician: { slug: "x" } });
    h.findUnique.mockResolvedValueOnce(null);

    const res = await POST(req({ primaryId: "a", secondaryId: "b" }), ctx);

    expect(res.status).toBe(404);
    expect(h.mergeAffairs).not.toHaveBeenCalled();
  });

  it("delegates to the service with the request context", async () => {
    h.findUnique.mockResolvedValueOnce({ id: "a", politician: { slug: "jean-dupont" } });
    h.findUnique.mockResolvedValueOnce({ id: "b" });

    const res = await POST(req({ primaryId: "a", secondaryId: "b" }), ctx);

    expect(res.status).toBe(200);
    expect(h.mergeAffairs).toHaveBeenCalledWith("a", "b", {
      audit: { ipAddress: "203.0.113.1", userAgent: "test-agent" },
    });
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      sourcesMoved: 2,
      slugsPreserved: ["absorbee"],
    });
  });

  it("invalidates caches only after the merge committed", async () => {
    h.findUnique.mockResolvedValueOnce({ id: "a", politician: { slug: "jean-dupont" } });
    h.findUnique.mockResolvedValueOnce({ id: "b" });

    await POST(req({ primaryId: "a", secondaryId: "b" }), ctx);

    expect(order[0]).toBe("merge");
    expect(order.slice(1)).toEqual(["invalidate", "invalidate"]);
    expect(h.invalidateEntity).toHaveBeenCalledWith("politician", "jean-dupont");
  });

  it("does not invalidate when the merge throws", async () => {
    h.findUnique.mockResolvedValueOnce({ id: "a", politician: { slug: "jean-dupont" } });
    h.findUnique.mockResolvedValueOnce({ id: "b" });
    h.mergeAffairs.mockRejectedValueOnce(new Error("rollback"));

    await expect(POST(req({ primaryId: "a", secondaryId: "b" }), ctx)).rejects.toThrow("rollback");
    expect(h.invalidateEntity).not.toHaveBeenCalled();
  });
});
