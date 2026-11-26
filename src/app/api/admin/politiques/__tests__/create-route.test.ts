import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPoliticianSchema } from "@/lib/security/schemas/politician";

// The route only translates the domain result into a status code. The schema is tested here
// too: it is what keeps a status, a party or a biography out of a creation.

const h = vi.hoisted(() => ({ createDraftPolitician: vi.fn() }));

vi.mock("@/lib/politicians/create-draft", () => ({
  createDraftPolitician: h.createDraftPolitician,
}));
vi.mock("@/lib/api/with-admin-auth", () => ({
  withAdminAuth: (fn: (req: unknown, ctx: unknown) => unknown) => (req: unknown, ctx: unknown) =>
    fn(req, ctx),
}));

import { POST } from "@/app/api/admin/politiques/route";

function call(body: unknown) {
  return POST(
    {
      json: async () => body,
      headers: new Headers({ "x-forwarded-for": "203.0.113.1", "user-agent": "test-agent" }),
    } as never,
    { params: Promise.resolve({}) } as never
  );
}

const BODY = { firstName: "Camille", lastName: "Rivière", acknowledgedHomonymIds: [] };

beforeEach(() => {
  vi.clearAllMocks();
  h.createDraftPolitician.mockResolvedValue({
    kind: "created",
    politician: { id: "pol_new", slug: "camille-riviere", publicId: "PG-1" },
  });
});

describe("POST /api/admin/politiques", () => {
  it("répond 201 avec l'identifiant de la fiche", async () => {
    const res = await call(BODY);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "pol_new", slug: "camille-riviere", publicId: "PG-1" });
    expect(h.createDraftPolitician).toHaveBeenCalledWith(BODY, {
      ip: "203.0.113.1",
      userAgent: "test-agent",
    });
  });

  it("répond 409 avec la liste quand un homonyme n'a pas été vu", async () => {
    h.createDraftPolitician.mockResolvedValue({
      kind: "unseen-homonyms",
      homonyms: [{ id: "pol_other" }],
    });
    const res = await call(BODY);
    expect(res.status).toBe(409);
    expect((await res.json()).homonyms).toEqual([{ id: "pol_other" }]);
  });

  it("répond 400 quand l'identifiant d'URL est pris", async () => {
    h.createDraftPolitician.mockResolvedValue({ kind: "slug-taken", slug: "camille-riviere" });
    const res = await call(BODY);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("camille-riviere");
  });

  it("refuse une création sans la liste des homonymes vus", async () => {
    const res = await call({ firstName: "Camille", lastName: "Rivière" });
    expect(res.status).toBe(400);
    expect(h.createDraftPolitician).not.toHaveBeenCalled();
  });

  it("écarte le statut, le parti et la biographie envoyés par le client", async () => {
    await call({
      ...BODY,
      publicationStatus: "PUBLISHED",
      statusOverride: false,
      currentPartyId: "p_1",
      biography: "texte libre",
    });
    expect(h.createDraftPolitician.mock.calls[0]![0]).toEqual(BODY);
  });
});

describe("createPoliticianSchema", () => {
  it("accepte une fiche sans date de naissance ni civilité", () => {
    expect(createPoliticianSchema.safeParse(BODY).success).toBe(true);
  });

  it.each([
    ["date incomplète", { birthDate: "1975" }],
    ["slug avec majuscule ou espace", { slug: "Camille Riviere" }],
    ["nom vide", { lastName: "   " }],
  ])("refuse : %s", (_label, patch) => {
    expect(createPoliticianSchema.safeParse({ ...BODY, ...patch }).success).toBe(false);
  });
});
