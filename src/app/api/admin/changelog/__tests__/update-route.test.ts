import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Une entrée publiée ne peut jamais perdre son lien source : le garde porte sur l'état
 * résultant (statut effectif + source effective), pas sur le seul `status` du corps.
 */

const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  queryRaw: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const tx = {
    $queryRaw: h.queryRaw,
    changelogEntry: { findUnique: h.findUnique, update: h.update },
  };
  return {
    db: {
      auditLog: { create: h.auditCreate },
      $transaction: (fn: (t: unknown) => unknown) => fn(tx),
    },
  };
});
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
vi.mock("@/lib/cache", () => ({ revalidateTags: vi.fn() }));

import { PUT } from "@/app/api/admin/changelog/[id]/route";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx: any = { params: Promise.resolve({ id: "e1" }) };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function put(body: unknown): any {
  return new Request("http://test/api", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const published = {
  id: "e1",
  status: "PUBLISHED",
  sourceUrl: "https://example.org/a",
  date: new Date("2026-10-24T00:00:00Z"),
};

describe("PUT /api/admin/changelog/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.update.mockImplementation(async ({ data }) => ({ ...published, ...data }));
  });

  it("refuse de retirer la source d'une entrée déjà publiée", async () => {
    h.findUnique.mockResolvedValue(published);
    const res = await PUT(put({ sourceUrl: null }), ctx);
    expect(res.status).toBe(422);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("refuse de publier un brouillon sans source", async () => {
    h.findUnique.mockResolvedValue({ ...published, status: "DRAFT", sourceUrl: null });
    const res = await PUT(put({ status: "PUBLISHED" }), ctx);
    expect(res.status).toBe(422);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("autorise de retirer la source si l'entrée repasse en brouillon", async () => {
    h.findUnique.mockResolvedValue(published);
    const res = await PUT(put({ sourceUrl: null, status: "DRAFT" }), ctx);
    expect(res.status).toBe(200);
    expect(h.update).toHaveBeenCalledOnce();
  });

  it("autorise de modifier le titre d'une entrée publiée sourcée", async () => {
    h.findUnique.mockResolvedValue(published);
    const res = await PUT(put({ title: "Nouveau titre" }), ctx);
    expect(res.status).toBe(200);
  });

  it("verrouille la ligne avant de lire l'état", async () => {
    h.findUnique.mockResolvedValue(published);
    await PUT(put({ title: "x" }), ctx);
    expect(h.queryRaw).toHaveBeenCalledOnce();
  });

  it("renvoie 404 pour une entrée inconnue", async () => {
    h.findUnique.mockResolvedValue(null);
    const res = await PUT(put({ title: "x" }), ctx);
    expect(res.status).toBe(404);
  });
});
