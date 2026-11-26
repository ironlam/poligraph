import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  createLocalMandate: vi.fn(),
  invalidateEntity: vi.fn(),
  requestProfileRefresh: vi.fn(),
}));

vi.mock("@/lib/mandates/create-local", () => ({ createLocalMandate: h.createLocalMandate }));
vi.mock("@/lib/cache", () => ({ invalidateEntity: h.invalidateEntity }));
vi.mock("@/lib/politicians/profile-snapshot/request", () => ({
  requestProfileRefresh: h.requestProfileRefresh,
}));
vi.mock("@/lib/api/with-admin-auth", () => ({
  withAdminAuth: (fn: (req: unknown, ctx: unknown) => unknown) => (req: unknown, ctx: unknown) =>
    fn(req, ctx),
}));

import { POST } from "@/app/api/admin/politiques/[id]/mandats/route";

const BODY = {
  type: "ADJOINT_MAIRE",
  title: "Adjoint au maire de Saint-Exemple",
  institution: "Mairie de Saint-Exemple",
  communeId: "13099",
  startDate: "2008",
  isCurrent: false,
  sourceUrl: "https://example.org/arrete",
};

function call(body: unknown) {
  return POST(
    {
      json: async () => body,
      headers: new Headers({ "x-forwarded-for": "203.0.113.1", "user-agent": "test-agent" }),
    } as never,
    { params: Promise.resolve({ id: "pol_1" }) } as never
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.createLocalMandate.mockResolvedValue({
    kind: "created",
    mandate: { id: "man_1", publicId: "MA-1" },
    politician: { id: "pol_1", slug: "camille-riviere" },
  });
});

describe("POST /api/admin/politiques/[id]/mandats", () => {
  it("crée le mandat, demande le document de fiche puis purge les caches du mandat et de la fiche", async () => {
    const res = await call(BODY);

    expect(res.status).toBe(201);
    expect(h.createLocalMandate).toHaveBeenCalledWith("pol_1", BODY, {
      ip: "203.0.113.1",
      userAgent: "test-agent",
    });
    expect(h.requestProfileRefresh).toHaveBeenCalledWith(
      { politicianIds: ["pol_1"] },
      "admin:mandat-local-créé"
    );
    expect(h.invalidateEntity.mock.calls).toEqual([["mandate"], ["politician", "camille-riviere"]]);
  });

  it("refuse une saisie sans source avant toute écriture", async () => {
    const { sourceUrl: _omitted, ...body } = BODY;
    const res = await call(body);

    expect(res.status).toBe(400);
    expect(h.createLocalMandate).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: "politician-not-found" }, 404],
    [{ kind: "commune-not-found", communeId: "13099" }, 400],
    [{ kind: "duplicate", mandateId: "man_0" }, 409],
  ])("sur %j, répond %i sans purger ni demander de document", async (result, status) => {
    h.createLocalMandate.mockResolvedValue(result);
    const res = await call(BODY);

    expect(res.status).toBe(status);
    expect(h.invalidateEntity).not.toHaveBeenCalled();
    expect(h.requestProfileRefresh).not.toHaveBeenCalled();
  });
});
