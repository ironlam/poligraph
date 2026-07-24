import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression: affair mutations must invalidate the affected politicians'
// profiles (tagged `politician:<slug>`), not just the "affairs" tag — otherwise
// a depublished affair lingers on the politician's page until the 24h backstop.

const h = vi.hoisted(() => ({
  invalidateEntity: vi.fn(),
  invalidateAffectedPoliticians: vi.fn(),
  db: {
    affair: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
    },
    auditLog: { create: vi.fn(), createMany: vi.fn() },
  },
}));

vi.mock("@/lib/cache", () => ({
  invalidateEntity: h.invalidateEntity,
  invalidateAffectedPoliticians: h.invalidateAffectedPoliticians,
}));
vi.mock("@/lib/db", () => ({ db: h.db }));

// Pass-through auth + validation wrappers (we test invalidation, not auth/zod).
vi.mock("@/lib/api/with-admin-auth", () => ({
  withAdminAuth: (fn: (req: unknown, ctx: unknown) => unknown) => (req: unknown, ctx: unknown) =>
    fn(req, ctx),
}));
vi.mock("@/lib/security/validate", () => ({
  withValidation:
    (_s: unknown, fn: (req: unknown, ctx: unknown, body: unknown) => unknown) =>
    async (req: { json: () => Promise<unknown> }, ctx: unknown) =>
      fn(req, ctx, await req.json()),
}));
vi.mock("@/lib/security", () => ({
  withValidation:
    (_s: unknown, fn: (req: unknown, ctx: unknown, body: unknown) => unknown) =>
    async (req: { json: () => Promise<unknown> }, ctx: unknown) =>
      fn(req, ctx, await req.json()),
  getRequestMeta: () => ({ ip: "127.0.0.1", userAgent: "test" }),
}));
vi.mock("@/services/affairs/status-tracking", () => ({ trackStatusChange: vi.fn() }));
vi.mock("@/lib/affairs/publish-guard", () => ({
  assertPublishable: vi.fn(),
  PublishGuardError: class PublishGuardError extends Error {},
  VERIFIED_BY_MODERATION: "Poligraph Moderation",
  PUBLISHED_STATUS: "PUBLISHED",
}));

import { POST as moderatePOST } from "@/app/api/admin/affaires/moderate/route";
import { POST as bulkPOST } from "@/app/api/admin/affaires/bulk/route";
import { PATCH as quickUpdatePATCH } from "@/app/api/admin/affaires/[id]/quick-update/route";

const db = h.db;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function req(body: unknown): any {
  return new Request("http://test/api", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ctx(params: Record<string, string> = {}): any {
  return { params: Promise.resolve(params) };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.auditLog.create.mockResolvedValue({});
  db.auditLog.createMany.mockResolvedValue({});
});

describe("affair mutations invalidate affected politician profiles", () => {
  it("moderate (reject) invalidates each affected politician", async () => {
    db.affair.findMany.mockResolvedValue([
      { politician: { slug: "pol-a" } },
      { politician: { slug: "pol-a" } },
      { politician: { slug: "pol-b" } },
    ]);
    db.affair.updateMany.mockResolvedValue({ count: 3 });

    await moderatePOST(req({ ids: ["1", "2", "3"], action: "reject" }), ctx());

    expect(h.invalidateEntity).toHaveBeenCalledWith("affair");
    expect(h.invalidateAffectedPoliticians).toHaveBeenCalledWith(["pol-a", "pol-a", "pol-b"]);
  });

  it("bulk (delete) captures politicians before deleting, then invalidates them", async () => {
    db.affair.findMany.mockResolvedValue([{ politician: { slug: "pol-x" } }]);
    db.affair.deleteMany.mockResolvedValue({ count: 1 });

    await bulkPOST(req({ ids: ["1"], action: "delete" }), ctx());

    expect(db.affair.findMany).toHaveBeenCalled();
    expect(h.invalidateAffectedPoliticians).toHaveBeenCalledWith(["pol-x"]);
  });

  it("quick-update (depublish) invalidates the affair's politician", async () => {
    db.affair.findUnique.mockResolvedValue({
      id: "1",
      status: "RELAXE",
      involvement: "DIRECT",
      slug: "aff-slug",
      politicianId: "p1",
      publicationStatus: "PUBLISHED",
      politician: { slug: "pol-x" },
    });
    db.affair.update.mockResolvedValue({ id: "1" });

    await quickUpdatePATCH(req({ publicationStatus: "DRAFT" }), ctx({ id: "1" }));

    expect(h.invalidateEntity).toHaveBeenCalledWith("affair", "aff-slug");
    expect(h.invalidateAffectedPoliticians).toHaveBeenCalledWith(["pol-x"]);
  });
});
