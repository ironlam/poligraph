import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  auditCreate: vi.fn(),
  invalidateEntity: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    factCheck: { findUnique: h.findUnique, update: h.update },
    auditLog: { create: h.auditCreate },
  },
}));
vi.mock("@/lib/api/with-admin-auth", () => ({
  withAdminAuth: (handler: unknown) => handler,
}));
vi.mock("@/lib/cache", () => ({ invalidateEntity: h.invalidateEntity }));

import { POST } from "./route";

const ctx = { params: Promise.resolve({ id: "fc1" }) };

function req(body: unknown) {
  return new NextRequest("https://poligraph.fr/api/admin/factchecks/fc1/theme", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.findUnique.mockResolvedValue({ id: "fc1", theme: "SANTE", themeReviewedAt: null });
});

describe("POST /api/admin/factchecks/[id]/theme", () => {
  it("enregistre le thème corrigé avec sa date de validation, et l'écrit au journal", async () => {
    const res = await POST(req({ theme: "ECONOMIE_BUDGET" }), ctx);
    expect(res.status).toBe(200);

    const { where, data } = h.update.mock.calls[0]![0];
    expect(where).toEqual({ id: "fc1" });
    expect(data.theme).toBe("ECONOMIE_BUDGET");
    expect(data.themeReviewedAt).toBeInstanceOf(Date);

    const audit = h.auditCreate.mock.calls[0]![0].data;
    expect(audit).toMatchObject({ action: "UPDATE", entityType: "FactCheck", entityId: "fc1" });
    expect(audit.changes.theme).toEqual({ from: "SANTE", to: "ECONOMIE_BUDGET" });
  });

  it("enregistre « aucun thème » comme une validation", async () => {
    const res = await POST(req({ theme: null }), ctx);
    expect(res.status).toBe(200);
    expect(h.update.mock.calls[0]![0].data.theme).toBeNull();
    expect(h.update.mock.calls[0]![0].data.themeReviewedAt).toBeInstanceOf(Date);
  });

  it("refuse un thème que les scrutins ne portent pas", async () => {
    // RETRAITES exists in ThemeCategory but tags presidential measures only: no vote would match.
    const res = await POST(req({ theme: "RETRAITES" }), ctx);
    expect(res.status).toBe(400);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("refuse un corps sans thème", async () => {
    const res = await POST(req({}), ctx);
    expect(res.status).toBe(400);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("répond 404 pour un fact-check inconnu, sans rien écrire", async () => {
    h.findUnique.mockResolvedValue(null);
    const res = await POST(req({ theme: "SANTE" }), ctx);
    expect(res.status).toBe(404);
    expect(h.update).not.toHaveBeenCalled();
    expect(h.auditCreate).not.toHaveBeenCalled();
  });

  it("ne purge aucun cache : la file valide des centaines de fact-checks à la suite", async () => {
    await POST(req({ theme: "SANTE" }), ctx);
    expect(h.invalidateEntity).not.toHaveBeenCalled();
  });
});
