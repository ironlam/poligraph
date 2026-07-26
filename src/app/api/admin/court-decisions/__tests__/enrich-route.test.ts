import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Issue #337 — the admin trigger for targeted Judilibre enrichment.
 *
 * What these tests defend: the route is behind the admin guard, requires an explicit
 * confirmation and at least one reference, refuses a name-based input by having no
 * field for it, invalidates caches only after a real write, and turns each refusal
 * into a status code rather than a silent success.
 */

const h = vi.hoisted(() => ({
  decisionFindUnique: vi.fn(),
  linkFindMany: vi.fn(),
  enrich: vi.fn(),
  invalidateEntity: vi.fn(),
  adminGuard: vi.fn(),
}));

const order: string[] = [];

vi.mock("@/lib/db", () => ({
  db: {
    courtDecision: { findUnique: h.decisionFindUnique },
    affairCourtDecision: { findMany: h.linkFindMany },
  },
}));
vi.mock("@/lib/cache", () => ({
  invalidateEntity: (...args: unknown[]) => {
    order.push("invalidate");
    return h.invalidateEntity(...args);
  },
}));
vi.mock("@/services/affairs/enrich-court-decision", () => ({
  enrichCourtDecisionFromJudilibre: (...args: unknown[]) => {
    order.push("enrich");
    return h.enrich(...args);
  },
}));
vi.mock("@/lib/api/with-admin-auth", () => ({
  withAdminAuth: (fn: (req: unknown, ctx: unknown) => unknown) => (req: unknown, ctx: unknown) => {
    h.adminGuard();
    return fn(req, ctx);
  },
}));

import { POST } from "../[id]/enrich/route";

function request(body: unknown) {
  return new Request("https://poligraph.fr/api/admin/court-decisions/dec_1/enrich", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "test-agent" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

const context = { params: Promise.resolve({ id: "dec_1" }) } as unknown as Parameters<
  typeof POST
>[1];

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  h.decisionFindUnique.mockResolvedValue({ id: "dec_1" });
  h.linkFindMany.mockResolvedValue([{ affair: { politician: { slug: "jean-exemple" } } }]);
  h.enrich.mockResolvedValue({ status: "UPDATED", judilibreId: "jud_1", changes: [] });
});

describe("POST enrichissement — succès (#337)", () => {
  it("passe la référence au service et rend les changements", async () => {
    const response = await POST(request({ pourvoiNumber: "96-83.698", confirmed: true }), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "UPDATED",
      judilibreId: "jud_1",
    });
    expect(h.enrich.mock.calls[0]![0]).toMatchObject({
      courtDecisionId: "dec_1",
      pourvoiNumber: "96-83.698",
      triggeredBy: "admin",
    });
  });

  it("invalide les caches seulement après l'écriture", async () => {
    await POST(request({ judilibreId: "jud_1", confirmed: true }), context);

    expect(order).toEqual(["enrich", "invalidate", "invalidate"]);
    expect(h.invalidateEntity).toHaveBeenCalledWith("affair");
    expect(h.invalidateEntity).toHaveBeenCalledWith("politician", "jean-exemple");
  });

  it("n'invalide rien quand rien n'a changé", async () => {
    h.enrich.mockResolvedValue({ status: "UNCHANGED", judilibreId: "jud_1" });

    const response = await POST(request({ judilibreId: "jud_1", confirmed: true }), context);

    expect(response.status).toBe(200);
    expect(h.invalidateEntity).not.toHaveBeenCalled();
  });
});

describe("POST enrichissement — refus (#337)", () => {
  it("exige une confirmation explicite", async () => {
    const response = await POST(request({ pourvoiNumber: "96-83.698" }), context);

    expect(response.status).toBe(400);
    expect(h.enrich).not.toHaveBeenCalled();
  });

  it("exige au moins une référence", async () => {
    const response = await POST(request({ confirmed: true }), context);

    expect(response.status).toBe(400);
    expect(h.enrich).not.toHaveBeenCalled();
  });

  it("n'accepte aucun champ de recherche par nom", async () => {
    // Le flux abandonné : nom → recherche → affaire. Le schéma ne peut pas l'exprimer.
    await POST(request({ name: "Jean Exemple", politician: "x", confirmed: true }), context);

    expect(h.enrich).not.toHaveBeenCalled();
  });

  it("rend 404 sur une décision inexistante, sans appeler le service", async () => {
    h.decisionFindUnique.mockResolvedValue(null);

    const response = await POST(request({ judilibreId: "jud_1", confirmed: true }), context);

    expect(response.status).toBe(404);
    expect(h.enrich).not.toHaveBeenCalled();
  });

  it("rend 409 sur un pourvoi ambigu, et n'invalide rien", async () => {
    h.enrich.mockResolvedValue({
      status: "AMBIGUOUS",
      reference: "96-83.698",
      candidates: ["a", "b"],
    });

    const response = await POST(request({ pourvoiNumber: "96-83.698", confirmed: true }), context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ status: "AMBIGUOUS" });
    expect(h.invalidateEntity).not.toHaveBeenCalled();
  });

  it("rend 409 sur une identité contradictoire", async () => {
    h.enrich.mockResolvedValue({ status: "CONFLICT", reason: "identifiant différent" });

    const response = await POST(request({ judilibreId: "jud_1", confirmed: true }), context);

    expect(response.status).toBe(409);
  });

  it("rend 404 quand la référence ne résout pas", async () => {
    h.enrich.mockResolvedValue({ status: "NOT_FOUND", reference: "00-00.000" });

    const response = await POST(request({ pourvoiNumber: "00-00.000", confirmed: true }), context);

    expect(response.status).toBe(404);
  });

  it("rend 503 quand Judilibre n'est pas configuré", async () => {
    h.enrich.mockResolvedValue({ status: "UNAVAILABLE" });

    const response = await POST(request({ judilibreId: "jud_1", confirmed: true }), context);

    expect(response.status).toBe(503);
  });
});

describe("POST enrichissement — périmètre (#337)", () => {
  it("passe par la garde admin", async () => {
    await POST(request({ judilibreId: "jud_1", confirmed: true }), context);

    expect(h.adminGuard).toHaveBeenCalled();
  });

  it("n'atteint aucune table d'affaire en écriture", async () => {
    await POST(request({ judilibreId: "jud_1", confirmed: true }), context);

    // La route ne lit les liaisons que pour invalider ; rien d'autre n'est exposé.
    expect(h.linkFindMany.mock.calls[0]![0]).toMatchObject({
      where: { courtDecisionId: "dec_1" },
    });
  });
});
