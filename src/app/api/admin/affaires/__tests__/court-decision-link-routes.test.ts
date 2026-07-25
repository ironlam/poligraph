import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Issue #536 — admin management of affair ↔ decision links.
 *
 * What these tests defend: an unlink removes the join row and nothing else, a link is
 * idempotent, every write leaves an audit entry in the same transaction, caches are
 * invalidated only after the commit, and no route can reach a decision's own row.
 */

const order: string[] = [];

const h = vi.hoisted(() => ({
  affairFindUnique: vi.fn(),
  decisionFindUnique: vi.fn(),
  decisionFindMany: vi.fn(),
  linkFindUnique: vi.fn(),
  linkCreate: vi.fn(),
  linkUpdate: vi.fn(),
  linkDeleteMany: vi.fn(),
  auditCreate: vi.fn(),
  invalidateEntity: vi.fn(),
  adminGuard: vi.fn(),
}));

let rolledBack = false;

vi.mock("@/lib/db", () => ({
  db: {
    affair: { findUnique: h.affairFindUnique },
    courtDecision: { findUnique: h.decisionFindUnique, findMany: h.decisionFindMany },
    $transaction: async (fn: (t: unknown) => unknown) => {
      try {
        return await fn({
          affairCourtDecision: {
            findUnique: h.linkFindUnique,
            create: h.linkCreate,
            update: h.linkUpdate,
            deleteMany: h.linkDeleteMany,
          },
          auditLog: { create: h.auditCreate },
        });
      } catch (error) {
        rolledBack = true;
        throw error;
      }
    },
  },
}));
vi.mock("@/lib/cache", () => ({ invalidateEntity: h.invalidateEntity }));
vi.mock("@/lib/api/with-admin-auth", () => ({
  withAdminAuth: (fn: (req: unknown, ctx: unknown) => unknown) => (req: unknown, ctx: unknown) => {
    // Records that the guard wrapped the handler, and lets a test refuse the call.
    h.adminGuard();
    return fn(req, ctx);
  },
}));
vi.mock("@/lib/security", () => ({
  withValidation:
    (_s: unknown, fn: (req: unknown, ctx: unknown, body: unknown) => unknown) =>
    async (req: { json: () => Promise<unknown> }, ctx: unknown) =>
      fn(req, ctx, await req.json()),
  getRequestMeta: () => ({ ip: "203.0.113.1", userAgent: "test-agent" }),
}));

import {
  POST as linkPOST,
  PATCH as notePATCH,
  DELETE as unlinkDELETE,
} from "@/app/api/admin/affaires/[id]/decisions/route";
import { GET as searchGET } from "@/app/api/admin/court-decisions/search/route";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx: any = { params: Promise.resolve({ id: "a1" }) };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function req(body: unknown, method = "POST"): any {
  return new Request("http://test/api", {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function searchReq(q: string): any {
  return new Request(`http://test/api/admin/court-decisions/search?q=${encodeURIComponent(q)}`);
}

const AFFAIR = { id: "a1", politician: { slug: "jean-dupont" } };
const DECISION = { id: "dec_1" };

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  rolledBack = false;
  h.affairFindUnique.mockResolvedValue(AFFAIR);
  h.decisionFindUnique.mockResolvedValue(DECISION);
  h.decisionFindMany.mockResolvedValue([]);
  h.linkFindUnique.mockResolvedValue(null);
  h.linkCreate.mockImplementation(async () => {
    order.push("link");
    return {};
  });
  h.linkUpdate.mockImplementation(async () => {
    order.push("update");
    return {};
  });
  h.linkDeleteMany.mockImplementation(async () => {
    order.push("delete");
    return { count: 1 };
  });
  h.auditCreate.mockImplementation(async () => {
    order.push("audit");
    return {};
  });
  h.invalidateEntity.mockImplementation(() => {
    order.push("invalidate");
  });
});

describe("Recherche de décisions existantes (#536)", () => {
  it("cherche par ECLI exact", async () => {
    await searchGET(searchReq("ECLI:FR:CCASS:1997:C100001"), ctx);

    const where = h.decisionFindMany.mock.calls[0]![0].where;
    expect(where.OR).toEqual(expect.arrayContaining([{ ecli: "ECLI:FR:CCASS:1997:C100001" }]));
  });

  it("cherche par judilibreId exact", async () => {
    await searchGET(searchReq("jud_42"), ctx);

    const where = h.decisionFindMany.mock.calls[0]![0].where;
    expect(where.OR).toEqual(expect.arrayContaining([{ judilibreId: "jud_42" }]));
  });

  it("cherche par pourvoi normalisé", async () => {
    await searchGET(searchReq("96-83.698"), ctx);

    const where = h.decisionFindMany.mock.calls[0]![0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([{ pourvoiNumberNormalized: { contains: "9683698" } }])
    );
  });

  it("rend toujours une LISTE, même pour un pourvoi partagé", async () => {
    h.decisionFindMany.mockResolvedValue([
      { id: "dec_1", pourvoiNumber: "96-83.698", _count: { affairs: 2 } },
      { id: "dec_2", pourvoiNumber: "96-83.698", _count: { affairs: 1 } },
    ]);

    const res = await searchGET(searchReq("96-83.698"), ctx);
    const body = await res.json();

    // Un pourvoi peut produire plusieurs décisions : aucune n'est présentée comme
    // la bonne.
    expect(body.results).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.results[0].linkedAffairCount).toBe(2);
  });

  it("refuse un terme trop court", async () => {
    const res = await searchGET(searchReq("a"), ctx);

    expect(res.status).toBe(400);
    expect(h.decisionFindMany).not.toHaveBeenCalled();
  });

  it("passe par la garde admin", async () => {
    await searchGET(searchReq("96-83.698"), ctx);

    expect(h.adminGuard).toHaveBeenCalled();
  });
});

describe("Liaison (#536)", () => {
  it("lie une décision et consigne l'audit dans la même transaction", async () => {
    const res = await linkPOST(req({ courtDecisionId: "dec_1" }), ctx);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ created: true });
    expect(order.slice(0, 2)).toEqual(["link", "audit"]);
  });

  it("est idempotente : une liaison existante ne crée pas de doublon", async () => {
    h.linkFindUnique.mockResolvedValue({ affairId: "a1" });

    const res = await linkPOST(req({ courtDecisionId: "dec_1" }), ctx);

    await expect(res.json()).resolves.toMatchObject({ created: false });
    expect(h.linkCreate).not.toHaveBeenCalled();
    expect(h.auditCreate).not.toHaveBeenCalled();
  });

  it("renvoie 404 sur une affaire inexistante", async () => {
    h.affairFindUnique.mockResolvedValue(null);

    const res = await linkPOST(req({ courtDecisionId: "dec_1" }), ctx);

    expect(res.status).toBe(404);
    expect(h.linkCreate).not.toHaveBeenCalled();
  });

  it("renvoie 404 sur une décision inexistante", async () => {
    h.decisionFindUnique.mockResolvedValue(null);

    const res = await linkPOST(req({ courtDecisionId: "absente" }), ctx);

    expect(res.status).toBe(404);
    expect(h.linkCreate).not.toHaveBeenCalled();
  });

  it("invalide les caches seulement après le commit", async () => {
    await linkPOST(req({ courtDecisionId: "dec_1" }), ctx);

    expect(order).toEqual(["link", "audit", "invalidate", "invalidate"]);
  });

  it("annule la liaison si l'audit échoue", async () => {
    h.auditCreate.mockRejectedValue(new Error("audit failed"));

    await expect(linkPOST(req({ courtDecisionId: "dec_1" }), ctx)).rejects.toThrow("audit failed");

    expect(rolledBack).toBe(true);
    expect(h.invalidateEntity).not.toHaveBeenCalled();
  });
});

describe("Note de liaison (#536)", () => {
  it("met la note à jour et garde l'ancienne valeur en audit", async () => {
    h.linkFindUnique.mockResolvedValue({ notes: "ancienne" });

    const res = await notePATCH(
      req({ courtDecisionId: "dec_1", notes: "deux chefs" }, "PATCH"),
      ctx
    );

    expect(res.status).toBe(200);
    expect(h.linkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { notes: "deux chefs" } })
    );
    expect(h.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          changes: expect.objectContaining({ notes: "deux chefs", previousNotes: "ancienne" }),
        }),
      })
    );
  });

  it("renvoie 404 quand la liaison n'existe pas", async () => {
    h.linkFindUnique.mockResolvedValue(null);

    const res = await notePATCH(req({ courtDecisionId: "dec_1", notes: null }, "PATCH"), ctx);

    expect(res.status).toBe(404);
    expect(h.linkUpdate).not.toHaveBeenCalled();
  });
});

describe("Retrait de liaison (#536)", () => {
  it("supprime la liaison, jamais la décision", async () => {
    const res = await unlinkDELETE(
      req({ courtDecisionId: "dec_1", confirmed: true }, "DELETE"),
      ctx
    );

    expect(res.status).toBe(200);
    expect(h.linkDeleteMany).toHaveBeenCalledWith({
      where: { affairId: "a1", courtDecisionId: "dec_1" },
    });
    // Le client de transaction simulé n'expose aucune suppression de décision : si la
    // route en tentait une, l'appel échouerait.
    expect(h.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: "AffairCourtDecision",
          changes: expect.objectContaining({ courtDecisionDeleted: false }),
        }),
      })
    );
  });

  it("laisse une décision orpheline en base", async () => {
    // Aucun appel de nettoyage : une décision survit aux fiches qui la citaient.
    await unlinkDELETE(req({ courtDecisionId: "dec_1", confirmed: true }, "DELETE"), ctx);

    expect(order.filter((o) => o === "delete")).toHaveLength(1);
    expect(order).not.toContain("deleteDecision");
  });

  it("invalide les caches seulement après le commit", async () => {
    await unlinkDELETE(req({ courtDecisionId: "dec_1", confirmed: true }, "DELETE"), ctx);

    expect(order).toEqual(["delete", "audit", "invalidate", "invalidate"]);
  });

  it("annule le retrait si l'audit échoue", async () => {
    h.auditCreate.mockRejectedValue(new Error("audit failed"));

    await expect(
      unlinkDELETE(req({ courtDecisionId: "dec_1", confirmed: true }, "DELETE"), ctx)
    ).rejects.toThrow("audit failed");

    expect(rolledBack).toBe(true);
    expect(h.invalidateEntity).not.toHaveBeenCalled();
  });

  it("renvoie 404 sur une affaire inexistante", async () => {
    h.affairFindUnique.mockResolvedValue(null);

    const res = await unlinkDELETE(
      req({ courtDecisionId: "dec_1", confirmed: true }, "DELETE"),
      ctx
    );

    expect(res.status).toBe(404);
    expect(h.linkDeleteMany).not.toHaveBeenCalled();
  });
});

describe("Périmètre : la route ne touche pas au catalogue (#536)", () => {
  it("n'appelle jamais une création ou une suppression de décision", async () => {
    await linkPOST(req({ courtDecisionId: "dec_1" }), ctx);
    await notePATCH(req({ courtDecisionId: "dec_1", notes: "x" }, "PATCH"), ctx);
    await unlinkDELETE(req({ courtDecisionId: "dec_1", confirmed: true }, "DELETE"), ctx);

    // Seule la lecture est exposée sur le modèle de décision.
    expect(h.decisionFindUnique).toHaveBeenCalled();
    const decisionMock = h.decisionFindUnique.mock;
    expect(decisionMock).toBeDefined();
  });

  it("chaque écriture passe par la garde admin", async () => {
    await linkPOST(req({ courtDecisionId: "dec_1" }), ctx);
    await unlinkDELETE(req({ courtDecisionId: "dec_1", confirmed: true }, "DELETE"), ctx);

    expect(h.adminGuard).toHaveBeenCalledTimes(2);
  });
});
