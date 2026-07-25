import { describe, it, expect, vi, beforeEach } from "vitest";

// Affaires v2, lot 1: the accept/reject routes. What matters here is the HTTP
// contract and that cache invalidation happens only after the service committed.

const order: string[] = [];

const h = vi.hoisted(() => ({
  acceptProposal: vi.fn(),
  rejectProposal: vi.fn(),
  invalidateEntity: vi.fn(),
  invalidateAffectedPoliticians: vi.fn(),
}));

vi.mock("@/services/affairs/proposal-review", () => ({
  acceptProposal: h.acceptProposal,
  rejectProposal: h.rejectProposal,
}));
vi.mock("@/lib/cache", () => ({
  invalidateEntity: h.invalidateEntity,
  invalidateAffectedPoliticians: h.invalidateAffectedPoliticians,
}));
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

import { POST as acceptPOST } from "@/app/api/admin/affaires/propositions/[id]/accept/route";
import { POST as rejectPOST } from "@/app/api/admin/affaires/propositions/[id]/reject/route";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function req(body: unknown = {}): any {
  return new Request("http://test/api", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ctx(params: Record<string, string>): any {
  return { params: Promise.resolve(params) };
}

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  h.invalidateEntity.mockImplementation(() => void order.push("invalidate:affair"));
  h.invalidateAffectedPoliticians.mockImplementation(
    () => void order.push("invalidate:politicians")
  );
});

describe("POST accept", () => {
  it("invalide l'affaire et le profil du politique après le commit", async () => {
    h.acceptProposal.mockImplementation(async () => {
      order.push("commit");
      return {
        ok: true,
        affairId: "aff_1",
        affairSlug: "affaire-test",
        politicianSlug: "jean-testeur",
        appliedFields: ["status"],
      };
    });

    const res = await acceptPOST(req(), ctx({ id: "prop_1" }));

    expect(res.status).toBe(200);
    expect(h.invalidateEntity).toHaveBeenCalledWith("affair", "affaire-test");
    expect(h.invalidateAffectedPoliticians).toHaveBeenCalledWith(["jean-testeur"]);
    // Ordering is the point: a rollback must never leave a purged cache behind.
    expect(order).toEqual(["commit", "invalidate:affair", "invalidate:politicians"]);
  });

  it("409 et aucune invalidation quand la valeur a dérivé", async () => {
    h.acceptProposal.mockResolvedValue({
      ok: false,
      reason: "conflict",
      conflictDetail: { status: { expected: "APPEL_EN_COURS", actual: "RELAXE" } },
    });

    const res = await acceptPOST(req(), ctx({ id: "prop_1" }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.conflictDetail).toBeDefined();
    expect(h.invalidateEntity).not.toHaveBeenCalled();
    expect(h.invalidateAffectedPoliticians).not.toHaveBeenCalled();
  });

  it("422 sur un patch invalide", async () => {
    h.acceptProposal.mockResolvedValue({
      ok: false,
      reason: "invalid_patch",
      issues: ["publicationStatus: clé inconnue"],
    });

    const res = await acceptPOST(req(), ctx({ id: "prop_1" }));

    expect(res.status).toBe(422);
    expect(h.invalidateEntity).not.toHaveBeenCalled();
  });

  it("409 sur une proposition déjà traitée, 404 sur un identifiant inconnu", async () => {
    h.acceptProposal.mockResolvedValue({ ok: false, reason: "not_pending", status: "REJECTED" });
    expect((await acceptPOST(req(), ctx({ id: "prop_1" }))).status).toBe(409);

    h.acceptProposal.mockResolvedValue({ ok: false, reason: "not_found" });
    expect((await acceptPOST(req(), ctx({ id: "prop_1" }))).status).toBe(404);

    expect(h.invalidateEntity).not.toHaveBeenCalled();
  });

  it("transmet la note de revue au service", async () => {
    h.acceptProposal.mockResolvedValue({
      ok: true,
      affairId: "aff_1",
      affairSlug: "s",
      politicianSlug: "p",
      appliedFields: [],
    });

    await acceptPOST(req({ reviewNotes: "Vérifié sur Légifrance" }), ctx({ id: "prop_1" }));

    expect(h.acceptProposal).toHaveBeenCalledWith(
      expect.objectContaining({ proposalId: "prop_1", reviewNotes: "Vérifié sur Légifrance" })
    );
  });
});

describe("POST reject", () => {
  it("n'invalide aucun cache : rien n'a changé sur l'affaire", async () => {
    h.rejectProposal.mockResolvedValue({ ok: true, affairId: "aff_1" });

    const res = await rejectPOST(
      req({ reviewNotes: "Source insuffisante" }),
      ctx({ id: "prop_1" })
    );

    expect(res.status).toBe(200);
    expect(h.invalidateEntity).not.toHaveBeenCalled();
    expect(h.invalidateAffectedPoliticians).not.toHaveBeenCalled();
  });

  it("409 sur une proposition déjà traitée", async () => {
    h.rejectProposal.mockResolvedValue({ ok: false, reason: "not_pending", status: "APPROVED" });

    const res = await rejectPOST(req(), ctx({ id: "prop_1" }));

    expect(res.status).toBe(409);
  });
});
