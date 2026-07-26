import { describe, it, expect, vi, beforeEach } from "vitest";

// #572: a depublication changes what the public site is allowed to show, so the
// row and its audit trail must land together and the cache must only be purged
// once that commit succeeded. A purge issued on a write that then rolls back
// would republish the old page from fresh data and lose the audit trail.

const h = vi.hoisted(() => ({
  invalidateEntity: vi.fn(),
  invalidateAffectedPoliticians: vi.fn(),
  assertPublishable: vi.fn(),
  db: {
    $transaction: vi.fn(),
    affair: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("@/lib/cache", () => ({
  invalidateEntity: h.invalidateEntity,
  invalidateAffectedPoliticians: h.invalidateAffectedPoliticians,
}));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/api/with-admin-auth", () => ({
  withAdminAuth: (fn: (req: unknown, ctx: unknown) => unknown) => (req: unknown, ctx: unknown) =>
    fn(req, ctx),
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
  assertPublishable: h.assertPublishable,
  // Mirrors the real signature: the route reads err.reasons to build its 422.
  PublishGuardError: class PublishGuardError extends Error {
    reasons: { message: string }[];
    constructor(affairId: string, reasons: { message: string }[]) {
      super(`Affaire ${affairId} non publiable`);
      this.name = "PublishGuardError";
      this.reasons = reasons;
    }
  },
  VERIFIED_BY_MODERATION: "Poligraph Moderation",
  PUBLISHED_STATUS: "PUBLISHED",
}));

import { PATCH as quickUpdatePATCH } from "@/app/api/admin/affaires/[id]/quick-update/route";

const db = h.db;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function req(body: unknown): any {
  return new Request("http://test/api", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ctx(id = "aff-1"): any {
  return { params: Promise.resolve({ id }) };
}

const PUBLISHED_AFFAIR = {
  id: "aff-1",
  status: "CONDAMNATION_DEFINITIVE",
  involvement: "DIRECT",
  slug: "aff-slug",
  politicianId: "p1",
  publicationStatus: "PUBLISHED",
  politician: { slug: "pol-x" },
};

beforeEach(() => {
  vi.clearAllMocks();
  db.affair.findUnique.mockResolvedValue(PUBLISHED_AFFAIR);
  db.auditLog.create.mockResolvedValue({});
  db.$transaction.mockResolvedValue([{ id: "aff-1" }, {}]);
});

describe("depublication commits before it invalidates", () => {
  it("writes the row and the audit trail in one transaction", async () => {
    await quickUpdatePATCH(req({ publicationStatus: "DRAFT" }), ctx());

    // Prisma's array form builds both PrismaPromises eagerly and executes them
    // at commit, so what matters is that both are handed to $transaction and
    // that neither is awaited on its own.
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.$transaction.mock.calls[0]?.[0]).toHaveLength(2);
    expect(db.affair.update).toHaveBeenCalledWith({
      where: { id: "aff-1" },
      data: { publicationStatus: "DRAFT" },
    });
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
    expect(db.auditLog.create.mock.calls[0]?.[0]?.data?.changes).toEqual({
      publicationStatus: "DRAFT",
    });
  });

  it("has invalidated nothing at the moment the transaction runs", async () => {
    let purgesAtCommitTime = -1;
    db.$transaction.mockImplementation(async () => {
      purgesAtCommitTime =
        h.invalidateEntity.mock.calls.length + h.invalidateAffectedPoliticians.mock.calls.length;
      return [{ id: "aff-1" }, {}];
    });

    await quickUpdatePATCH(req({ publicationStatus: "DRAFT" }), ctx());

    expect(purgesAtCommitTime).toBe(0);
    expect(h.invalidateEntity).toHaveBeenCalledWith("affair", "aff-slug");
    expect(h.invalidateAffectedPoliticians).toHaveBeenCalledWith(["pol-x"]);
  });

  it("invalidates nothing when the transaction fails", async () => {
    db.$transaction.mockRejectedValue(new Error("could not serialize access"));

    await expect(quickUpdatePATCH(req({ publicationStatus: "DRAFT" }), ctx())).rejects.toThrow(
      "could not serialize access"
    );

    expect(h.invalidateEntity).not.toHaveBeenCalled();
    expect(h.invalidateAffectedPoliticians).not.toHaveBeenCalled();
  });

  it("purges the affairs tag, which is what carries the sitemap shards", async () => {
    await quickUpdatePATCH(req({ publicationStatus: "DRAFT" }), ctx());

    // invalidateEntity("affair") is the single entry point; the sitemap shards
    // declare "affairs" so they ride along. See sitemap-tags.ts.
    expect(h.invalidateEntity).toHaveBeenCalledWith("affair", "aff-slug");
  });
});

describe("the publication flow is left as it was", () => {
  it("still runs the guard and does not wrap it in the transaction", async () => {
    db.affair.findUnique.mockResolvedValue({ ...PUBLISHED_AFFAIR, publicationStatus: "DRAFT" });
    h.assertPublishable.mockResolvedValue(undefined);

    await quickUpdatePATCH(req({ publicationStatus: "PUBLISHED" }), ctx());

    expect(h.assertPublishable).toHaveBeenCalledWith("aff-1", {
      verifiedBy: "Poligraph Moderation",
    });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
    expect(h.invalidateEntity).toHaveBeenCalledWith("affair", "aff-slug");
  });

  it("records no audit row when the guard refuses the publication", async () => {
    const { PublishGuardError } = await import("@/lib/affairs/publish-guard");
    db.affair.findUnique.mockResolvedValue({ ...PUBLISHED_AFFAIR, publicationStatus: "DRAFT" });
    h.assertPublishable.mockRejectedValue(
      new PublishGuardError("aff-1", [{ code: "NO_SOURCE", message: "aucune source" }])
    );

    const res = await quickUpdatePATCH(req({ publicationStatus: "PUBLISHED" }), ctx());

    expect(res.status).toBe(422);
    expect(db.auditLog.create).not.toHaveBeenCalled();
    expect(h.invalidateEntity).not.toHaveBeenCalled();
  });

  it("still routes a plain field edit through the transaction", async () => {
    await quickUpdatePATCH(req({ severity: "MAJEURE" }), ctx());

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(h.invalidateEntity).toHaveBeenCalledWith("affair", "aff-slug");
  });

  it("rejects an empty patch before touching the database", async () => {
    const res = await quickUpdatePATCH(req({}), ctx());

    expect(res.status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(h.invalidateEntity).not.toHaveBeenCalled();
  });
});
