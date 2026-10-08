import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression: affair mutations must invalidate the affected politicians'
// profiles (tagged `politician:<slug>`), not just the "affairs" tag — otherwise
// a depublished affair lingers on the politician's page until the 24h backstop.

const h = vi.hoisted(() => ({
  invalidateEntity: vi.fn(),
  invalidateAffectedPoliticians: vi.fn(),
  resolveProfileTargets: vi.fn(),
  refreshProfilesForModeration: vi.fn(),
  db: {
    // Depublication now commits the row and its audit trail together (#572).
    $transaction: vi.fn(),
    affair: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
    },
    auditLog: { create: vi.fn(), createMany: vi.fn() },
    // Les trois routes de décision closent désormais les revues en attente.
    moderationReview: { updateMany: vi.fn() },
  },
}));

vi.mock("@/lib/cache", () => ({
  invalidateEntity: h.invalidateEntity,
  invalidateAffectedPoliticians: h.invalidateAffectedPoliticians,
}));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/politicians/profile-snapshot/request", () => ({
  resolveProfileTargets: h.resolveProfileTargets,
}));
vi.mock("@/lib/politicians/profile-snapshot/moderation", () => ({
  refreshProfilesForModeration: h.refreshProfilesForModeration,
}));

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
  db.moderationReview.updateMany.mockResolvedValue({ count: 0 });
  db.$transaction.mockResolvedValue([{ id: "1" }, {}]);
  h.resolveProfileTargets.mockResolvedValue([]);
  h.refreshProfilesForModeration.mockResolvedValue([]);
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

// Régression : `ModerationReview.appliedAt` gouverne toutes les files de
// modération de l'admin et n'était écrit par AUCUN chemin. Chaque décision
// éditoriale laissait donc une revue en attente pour toujours, et la file
// grossissait d'une ligne à chaque fois qu'un humain faisait le travail.
describe("une décision clôt les revues de modération de son affaire", () => {
  const closeCall = () => db.moderationReview.updateMany.mock.calls[0]?.[0];

  it("moderate (reject) clôt les revues des affaires visées", async () => {
    db.affair.findMany.mockResolvedValue([{ politician: { slug: "p" } }]);
    db.affair.updateMany.mockResolvedValue({ count: 2 });

    await moderatePOST(req({ ids: ["a1", "a2"], action: "reject" }), ctx());

    expect(closeCall().where.affairId).toEqual({ in: ["a1", "a2"] });
    expect(closeCall().where.appliedAt).toBeNull();
    expect(closeCall().data.appliedBy).toBe("Poligraph Moderation");
  });

  it("bulk (reject) clôt les revues des affaires visées", async () => {
    db.affair.findMany.mockResolvedValue([{ politician: { slug: "p" } }]);
    db.affair.updateMany.mockResolvedValue({ count: 1 });

    await bulkPOST(req({ ids: ["b1"], action: "reject" }), ctx());

    expect(closeCall().where.affairId).toEqual({ in: ["b1"] });
  });

  it("bulk (delete) ne clôt rien : la cascade supprime les revues", async () => {
    db.affair.findMany.mockResolvedValue([{ politician: { slug: "p" } }]);
    db.affair.deleteMany.mockResolvedValue({ count: 1 });

    await bulkPOST(req({ ids: ["c1"], action: "delete" }), ctx());

    expect(db.moderationReview.updateMany).not.toHaveBeenCalled();
  });

  it("quick-update ne clôt RIEN sur une simple correction de champ", async () => {
    db.affair.findUnique.mockResolvedValue({
      id: "d1",
      slug: "s",
      status: "RELAXE",
      publicationStatus: "DRAFT",
      politician: { slug: "p" },
    });

    // Corriger un titre ne tranche pas l'affaire : la recommandation reste à examiner.
    await quickUpdatePATCH(req({ title: "Titre corrigé" }), ctx({ id: "d1" }));

    expect(db.moderationReview.updateMany).not.toHaveBeenCalled();
  });

  it("quick-update clôt quand le statut de publication change", async () => {
    db.affair.findUnique.mockResolvedValue({
      id: "d2",
      slug: "s",
      status: "RELAXE",
      publicationStatus: "PUBLISHED",
      politician: { slug: "p" },
    });

    await quickUpdatePATCH(req({ publicationStatus: "REJECTED" }), ctx({ id: "d2" }));

    expect(closeCall().where.affairId).toEqual({ in: ["d2"] });
  });
});

// The precomputed profile document must drop an unpublished affair within the moderation request.
describe("une décision de publication recalcule les fiches dans la requête", () => {
  it("moderate (reject) recalcule, et protège en priorité les fiches qui affichaient l'affaire", async () => {
    db.affair.findMany.mockResolvedValue([
      { id: "a1", publicationStatus: "PUBLISHED", politician: { slug: "pol-a" } },
      { id: "a2", publicationStatus: "DRAFT", politician: { slug: "pol-b" } },
    ]);
    db.affair.updateMany.mockResolvedValue({ count: 2 });
    h.resolveProfileTargets.mockResolvedValue(["pol-a-id", "pol-lie-id"]);

    await moderatePOST(req({ ids: ["a1", "a2"], action: "reject" }), ctx());

    // Only the published affair is privacy-critical, and it is resolved before the write.
    expect(h.resolveProfileTargets).toHaveBeenCalledWith({ affairIds: ["a1"] });
    expect(h.resolveProfileTargets.mock.invocationCallOrder[0]!).toBeLessThan(
      db.affair.updateMany.mock.invocationCallOrder[0]!
    );
    expect(h.refreshProfilesForModeration).toHaveBeenCalledWith(
      { affairIds: ["a1", "a2"] },
      "admin:affaires-reject",
      { privacyCriticalPoliticianIds: ["pol-a-id", "pol-lie-id"] }
    );
  });

  it("bulk (delete) résout les fiches avant la suppression puis les recalcule", async () => {
    db.affair.findMany.mockResolvedValue([
      { id: "c1", publicationStatus: "PUBLISHED", politician: { slug: "p" } },
    ]);
    db.affair.deleteMany.mockResolvedValue({ count: 1 });
    h.resolveProfileTargets.mockResolvedValue(["p-id"]);

    await bulkPOST(req({ ids: ["c1"], action: "delete" }), ctx());

    expect(h.resolveProfileTargets).toHaveBeenCalledWith({ affairIds: ["c1"] });
    const deleted = db.affair.deleteMany.mock.invocationCallOrder[0]!;
    for (const order of h.resolveProfileTargets.mock.invocationCallOrder) {
      expect(order).toBeLessThan(deleted);
    }
    expect(h.refreshProfilesForModeration).toHaveBeenCalledWith(
      { politicianIds: ["p-id"] },
      "admin:affaires-supprimées-en-lot",
      { privacyCriticalPoliticianIds: ["p-id"] }
    );
    expect(h.refreshProfilesForModeration.mock.invocationCallOrder[0]!).toBeGreaterThan(deleted);
  });

  it("quick-update (dépublication) recalcule la fiche de l'affaire", async () => {
    db.affair.findUnique.mockResolvedValue({
      id: "d3",
      slug: "s",
      status: "RELAXE",
      publicationStatus: "PUBLISHED",
      politician: { slug: "p" },
    });

    await quickUpdatePATCH(req({ publicationStatus: "REJECTED" }), ctx({ id: "d3" }));

    expect(h.refreshProfilesForModeration).toHaveBeenCalledWith(
      { affairIds: ["d3"] },
      "admin:affaire-mise-à-jour-rapide"
    );
  });
});
