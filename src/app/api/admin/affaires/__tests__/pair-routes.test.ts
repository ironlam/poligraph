import { describe, it, expect, vi, beforeEach } from "vitest";

// Issue #525 — the review endpoints. What matters: a published affair can never be
// deleted by a merge, classifying LINKED publishes nothing, and cache invalidation
// happens only after the write committed.

const order: string[] = [];

const h = vi.hoisted(() => ({
  affairFindUnique: vi.fn(),
  affairFindMany: vi.fn(),
  affairUpdate: vi.fn(),
  auditCreate: vi.fn(),
  decisionFindUnique: vi.fn(),
  absorbDraftIntoPublished: vi.fn(),
  withImportRun: vi.fn(),
  mergeAffairs: vi.fn(),
  recordPairDecision: vi.fn(),
  invalidateEntity: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    affair: {
      findUnique: h.affairFindUnique,
      findMany: h.affairFindMany,
      update: h.affairUpdate,
    },
    auditLog: { create: h.auditCreate },
    affairPairDecision: { findUnique: h.decisionFindUnique },
    // The link route writes the update and its audit entry together.
    $transaction: (fn: (t: unknown) => unknown) =>
      fn({ affair: { update: h.affairUpdate }, auditLog: { create: h.auditCreate } }),
  },
}));
vi.mock("@/services/affairs/reconciliation", () => ({ mergeAffairs: h.mergeAffairs }));
vi.mock("@/services/affairs/absorb-draft", () => ({
  absorbDraftIntoPublished: h.absorbDraftIntoPublished,
}));
vi.mock("@/services/affairs/import-run", () => ({
  withImportRun: h.withImportRun,
  IMPORTER_MANUAL_ADMIN: "manual-admin",
}));
vi.mock("@/services/affairs/pair-decision", () => ({
  recordPairDecision: h.recordPairDecision,
}));
vi.mock("@/lib/cache", () => ({ invalidateEntity: h.invalidateEntity }));
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

import { POST as decisionPOST } from "@/app/api/admin/affaires/doublons/decision/route";
import { POST as mergePOST } from "@/app/api/admin/affaires/doublons/fusionner/route";
import { POST as linkPOST } from "@/app/api/admin/affaires/doublons/lier/route";

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

const signal = { confidence: "HIGH", matchedBy: "pourvoiNumber", score: 0.95 };

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  h.recordPairDecision.mockResolvedValue("dec_1");
  h.mergeAffairs.mockImplementation(async () => {
    order.push("merge");
    return {
      sourcesMoved: 0,
      eventsMoved: 0,
      articlesMoved: 0,
      identifiersMerged: [],
      slugsPreserved: ["absorbee"],
    };
  });
  h.affairUpdate.mockImplementation(async () => {
    order.push("update");
    return {};
  });
  h.invalidateEntity.mockImplementation(() => {
    order.push("invalidate");
  });
  h.decisionFindUnique.mockResolvedValue({ classification: "LINKED" });
  h.absorbDraftIntoPublished.mockImplementation(async () => {
    order.push("absorb");
    return { proposalsCreated: 1, proposedFields: ["court"], recordedDifferences: [] };
  });
  h.withImportRun.mockImplementation(
    async (_i: string, fn: (ctx: { importRunId: string }) => unknown) =>
      fn({ importRunId: "run_1" })
  );
  h.auditCreate.mockImplementation(async () => {
    order.push("audit");
    return {};
  });
});

describe("POST /doublons/decision — classer sans rien déplacer (#525)", () => {
  it("enregistre le jugement avec la fraîcheur des deux fiches", async () => {
    h.affairFindMany.mockResolvedValue([
      { id: "a", updatedAt: new Date("2026-07-01") },
      { id: "b", updatedAt: new Date("2026-07-02") },
    ]);

    const res = await decisionPOST(
      req({ affairIdA: "a", affairIdB: "b", classification: "DISTINCT", signal }),
      ctx
    );

    expect(res.status).toBe(200);
    expect(h.recordPairDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        classification: "DISTINCT",
        affairAUpdatedAt: new Date("2026-07-01"),
        affairBUpdatedAt: new Date("2026-07-02"),
      })
    );
  });

  it("classer LINKED ne publie aucun lien", async () => {
    h.affairFindMany.mockResolvedValue([
      { id: "a", updatedAt: new Date("2026-07-01") },
      { id: "b", updatedAt: new Date("2026-07-01") },
    ]);

    await decisionPOST(
      req({ affairIdA: "a", affairIdB: "b", classification: "LINKED", signal }),
      ctx
    );

    expect(h.affairUpdate).not.toHaveBeenCalled();
  });

  it("refuse une paire d'une affaire avec elle-même", async () => {
    const res = await decisionPOST(
      req({ affairIdA: "a", affairIdB: "a", classification: "DISTINCT", signal }),
      ctx
    );

    expect(res.status).toBe(400);
    expect(h.recordPairDecision).not.toHaveBeenCalled();
  });

  it("renvoie 404 si une affaire a disparu", async () => {
    h.affairFindMany.mockResolvedValue([{ id: "a", updatedAt: new Date() }]);

    const res = await decisionPOST(
      req({ affairIdA: "a", affairIdB: "b", classification: "DISTINCT", signal }),
      ctx
    );

    expect(res.status).toBe(404);
  });
});

describe("POST /doublons/fusionner — jamais supprimer une fiche publiée (#525)", () => {
  it("refuse de supprimer une affaire publiée", async () => {
    h.affairFindUnique
      .mockResolvedValueOnce({
        id: "keep",
        updatedAt: new Date(),
        publicationStatus: "PUBLISHED",
        politician: { slug: "x" },
      })
      .mockResolvedValueOnce({
        id: "remove",
        updatedAt: new Date(),
        publicationStatus: "PUBLISHED",
      });

    const res = await mergePOST(req({ keepId: "keep", removeId: "remove", signal }), ctx);

    expect(res.status).toBe(409);
    expect(h.mergeAffairs).not.toHaveBeenCalled();
  });

  it("emprunte le chemin d'absorption quand le survivant est publié", async () => {
    // Absorber dans une fiche publiée ne doit pas écrire court/chamber en direct :
    // seuls les identifiants attribués par une juridiction passent, le reste va en
    // proposition (#525 §4).
    h.affairFindUnique
      .mockResolvedValueOnce({
        id: "keep",
        updatedAt: new Date("2026-07-01"),
        publicationStatus: "PUBLISHED",
        politician: { slug: "jean-dupont" },
      })
      .mockResolvedValueOnce({
        id: "remove",
        updatedAt: new Date("2026-07-02"),
        publicationStatus: "DRAFT",
      });

    const res = await mergePOST(req({ keepId: "keep", removeId: "remove", signal }), ctx);

    expect(res.status).toBe(200);
    expect(h.mergeAffairs).not.toHaveBeenCalled();
    expect(h.absorbDraftIntoPublished).toHaveBeenCalledWith(
      expect.objectContaining({
        publishedId: "keep",
        draftId: "remove",
        pairDecision: expect.objectContaining({ reviewedBy: "admin" }),
      })
    );
    await expect(res.json()).resolves.toMatchObject({ proposalsCreated: 1 });
  });

  it("fusionne normalement entre deux brouillons, avec son jugement", async () => {
    h.affairFindUnique
      .mockResolvedValueOnce({
        id: "keep",
        updatedAt: new Date("2026-07-01"),
        publicationStatus: "DRAFT",
        politician: { slug: "jean-dupont" },
      })
      .mockResolvedValueOnce({
        id: "remove",
        updatedAt: new Date("2026-07-02"),
        publicationStatus: "DRAFT",
      });

    const res = await mergePOST(req({ keepId: "keep", removeId: "remove", signal }), ctx);

    expect(res.status).toBe(200);
    expect(h.absorbDraftIntoPublished).not.toHaveBeenCalled();
    expect(h.mergeAffairs).toHaveBeenCalledWith(
      "keep",
      "remove",
      expect.objectContaining({
        removeMustNotBePublished: true,
        pairDecision: expect.objectContaining({ otherAffairId: "remove" }),
      })
    );
  });

  it("invalide les caches seulement après la fusion", async () => {
    h.affairFindUnique
      .mockResolvedValueOnce({
        id: "keep",
        updatedAt: new Date(),
        publicationStatus: "DRAFT",
        politician: { slug: "jean-dupont" },
      })
      .mockResolvedValueOnce({ id: "remove", updatedAt: new Date(), publicationStatus: "DRAFT" });

    await mergePOST(req({ keepId: "keep", removeId: "remove", signal }), ctx);

    expect(order[0]).toBe("merge");
    expect(order.slice(1)).toEqual(["invalidate", "invalidate"]);
  });
});

describe("POST /doublons/lier — publier le lien est un acte séparé (#525)", () => {
  it("exige une décision « affaires liées » courante", async () => {
    h.decisionFindUnique.mockResolvedValue(null);
    h.affairFindUnique
      .mockResolvedValueOnce({ id: "from", linkedAffairId: null, politician: { slug: "x" } })
      .mockResolvedValueOnce({ id: "to" });

    const res = await linkPOST(
      req({ fromAffairId: "from", toAffairId: "to", confirmed: true }),
      ctx
    );

    expect(res.status).toBe(409);
    expect(h.affairUpdate).not.toHaveBeenCalled();
  });

  it("refuse quand la paire est classée autrement", async () => {
    h.decisionFindUnique.mockResolvedValue({ classification: "DISTINCT" });
    h.affairFindUnique
      .mockResolvedValueOnce({ id: "from", linkedAffairId: null, politician: { slug: "x" } })
      .mockResolvedValueOnce({ id: "to" });

    const res = await linkPOST(
      req({ fromAffairId: "from", toAffairId: "to", confirmed: true }),
      ctx
    );

    expect(res.status).toBe(409);
    expect(h.affairUpdate).not.toHaveBeenCalled();
  });

  it("écrit le lien et sa trace dans la même transaction", async () => {
    h.affairFindUnique
      .mockResolvedValueOnce({
        id: "from",
        linkedAffairId: null,
        politician: { slug: "jean-dupont" },
      })
      .mockResolvedValueOnce({ id: "to" });

    const res = await linkPOST(
      req({ fromAffairId: "from", toAffairId: "to", confirmed: true }),
      ctx
    );

    expect(res.status).toBe(200);
    expect(h.affairUpdate).toHaveBeenCalledWith({
      where: { id: "from" },
      data: { linkedAffairId: "to" },
    });
    // Écriture puis trace, puis seulement l'invalidation.
    expect(order).toEqual(["update", "audit", "invalidate", "invalidate"]);
  });

  it("refuse de remplacer un lien existant sans confirmation explicite de l'API", async () => {
    h.affairFindUnique
      .mockResolvedValueOnce({
        id: "from",
        linkedAffairId: "autre",
        politician: { slug: "jean-dupont" },
      })
      .mockResolvedValueOnce({ id: "to" });

    const res = await linkPOST(
      req({ fromAffairId: "from", toAffairId: "to", confirmed: true }),
      ctx
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ currentLinkedAffairId: "autre" });
    expect(h.affairUpdate).not.toHaveBeenCalled();
  });

  it("remplace quand la demande le confirme, et garde trace de l'ancien lien", async () => {
    h.affairFindUnique
      .mockResolvedValueOnce({
        id: "from",
        linkedAffairId: "autre",
        politician: { slug: "jean-dupont" },
      })
      .mockResolvedValueOnce({ id: "to" });

    const res = await linkPOST(
      req({
        fromAffairId: "from",
        toAffairId: "to",
        confirmed: true,
        confirmReplacement: true,
      }),
      ctx
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ replaced: true });
    expect(h.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        changes: expect.objectContaining({
          linkedAffairId: "to",
          replacedLinkedAffairId: "autre",
        }),
      }),
    });
  });

  it("renvoie 404 si une affaire a disparu", async () => {
    h.affairFindUnique.mockResolvedValue(null);

    const res = await linkPOST(
      req({ fromAffairId: "from", toAffairId: "to", confirmed: true }),
      ctx
    );

    expect(res.status).toBe(404);
    expect(h.affairUpdate).not.toHaveBeenCalled();
  });
});
