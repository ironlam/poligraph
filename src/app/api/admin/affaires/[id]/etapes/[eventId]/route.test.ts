import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  updateDraftEvent: vi.fn(),
  deleteDraftEvent: vi.fn(),
  publishEvent: vi.fn(),
  retractEvent: vi.fn(),
  confirmEvent: vi.fn(),
  invalidateEntity: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/api/with-admin-auth", () => ({
  withAdminAuth: (handler: unknown) => handler,
}));
vi.mock("@/lib/affairs/events/service", async (orig) => ({
  ...(await orig<typeof import("@/lib/affairs/events/service")>()),
  updateDraftEvent: h.updateDraftEvent,
  deleteDraftEvent: h.deleteDraftEvent,
  publishEvent: h.publishEvent,
  retractEvent: h.retractEvent,
  confirmEvent: h.confirmEvent,
}));
vi.mock("@/lib/cache", () => ({ invalidateEntity: h.invalidateEntity }));
vi.mock("@/lib/politicians/profile-snapshot/moderation", () => ({
  refreshProfilesForModeration: h.refresh,
}));

import { DELETE, PATCH, POST } from "./route";

const ctx = { params: Promise.resolve({ id: "aff1", eventId: "ev1" }) };
const OK = { ok: true, eventId: "ev1", affairSlug: "a-slug", politicianSlug: "p-slug" };
const valid = { type: "PROCES", date: "2024-05", occurrence: "HELD", title: "Procès" };

function req(method: string, body?: unknown) {
  return new NextRequest("https://poligraph.fr/api/admin/affaires/aff1/etapes/ev1", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST action", () => {
  it("PUBLISH invalide le cache et rafraîchit les profils", async () => {
    h.publishEvent.mockResolvedValue(OK);
    const res = await POST(req("POST", { action: "PUBLISH" }), ctx);
    expect(res.status).toBe(200);
    expect(h.publishEvent.mock.calls[0]!.slice(0, 2)).toEqual(["aff1", "ev1"]);
    expect(h.invalidateEntity).toHaveBeenCalledWith("affair", "a-slug");
    expect(h.invalidateEntity).toHaveBeenCalledWith("politician", "p-slug");
    expect(h.refresh).toHaveBeenCalledWith({ affairIds: ["aff1"] }, "admin:etape-affaire");
  });

  it("422 avec reasons, sans invalidation", async () => {
    h.publishEvent.mockResolvedValue({ ok: false, reason: "invalid", messages: ["x"] });
    const res = await POST(req("POST", { action: "PUBLISH" }), ctx);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Étape non publiable", reasons: ["x"] });
    expect(h.invalidateEntity).not.toHaveBeenCalled();
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it("409 sur not_draft, 404 sur not_found", async () => {
    h.publishEvent.mockResolvedValueOnce({ ok: false, reason: "not_draft" });
    expect((await POST(req("POST", { action: "PUBLISH" }), ctx)).status).toBe(409);
    h.publishEvent.mockResolvedValueOnce({ ok: false, reason: "not_found" });
    expect((await POST(req("POST", { action: "PUBLISH" }), ctx)).status).toBe(404);
  });

  it("RETRACT transmet la raison", async () => {
    h.retractEvent.mockResolvedValue(OK);
    const res = await POST(req("POST", { action: "RETRACT", reason: "Erreur" }), ctx);
    expect(res.status).toBe(200);
    expect(h.retractEvent.mock.calls[0]!.slice(0, 3)).toEqual(["aff1", "ev1", "Erreur"]);
    expect(h.refresh).toHaveBeenCalled();
  });

  it("400 sur CONFIRM sans sourceUrl", async () => {
    const res = await POST(req("POST", { action: "CONFIRM", sourceKind: "PRESS" }), ctx);
    expect(res.status).toBe(400);
    expect(h.confirmEvent).not.toHaveBeenCalled();
  });

  it("CONFIRM réussi invalide", async () => {
    h.confirmEvent.mockResolvedValue(OK);
    const res = await POST(
      req("POST", { action: "CONFIRM", sourceUrl: "https://x.test/a", sourceKind: "PRESS" }),
      ctx
    );
    expect(res.status).toBe(200);
    expect(h.invalidateEntity).toHaveBeenCalledTimes(2);
  });
});

describe("PATCH et DELETE", () => {
  it("PATCH n'invalide pas", async () => {
    h.updateDraftEvent.mockResolvedValue(OK);
    const res = await PATCH(req("PATCH", valid), ctx);
    expect(res.status).toBe(200);
    expect(h.updateDraftEvent.mock.calls[0]!.slice(0, 2)).toEqual(["aff1", "ev1"]);
    expect(h.invalidateEntity).not.toHaveBeenCalled();
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it("PATCH 409 sur not_draft", async () => {
    h.updateDraftEvent.mockResolvedValue({ ok: false, reason: "not_draft" });
    expect((await PATCH(req("PATCH", valid), ctx)).status).toBe(409);
  });

  it("DELETE 200 sans invalidation", async () => {
    h.deleteDraftEvent.mockResolvedValue(OK);
    const res = await DELETE(req("DELETE"), ctx);
    expect(res.status).toBe(200);
    expect(h.invalidateEntity).not.toHaveBeenCalled();
  });
});
