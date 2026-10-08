import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ createDraftEvent: vi.fn() }));

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/api/with-admin-auth", () => ({
  withAdminAuth: (handler: unknown) => handler,
}));
vi.mock("@/lib/affairs/events/service", async (orig) => ({
  ...(await orig<typeof import("@/lib/affairs/events/service")>()),
  createDraftEvent: h.createDraftEvent,
}));

import { POST } from "./route";

const ctx = { params: Promise.resolve({ id: "aff1" }) };
const valid = { type: "PROCES", date: "2024-05", occurrence: "HELD", title: "Procès" };

function req(body: unknown) {
  return new NextRequest("https://poligraph.fr/api/admin/affaires/aff1/etapes", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /etapes", () => {
  it("renvoie 201 et transmet la date en MONTH", async () => {
    h.createDraftEvent.mockResolvedValue({
      ok: true,
      eventId: "e1",
      affairSlug: "a",
      politicianSlug: "p",
    });
    const res = await POST(req(valid), ctx);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ eventId: "e1" });
    const [id, input] = h.createDraftEvent.mock.calls[0]!;
    expect(id).toBe("aff1");
    expect(input.datePrecision).toBe("MONTH");
  });

  it("400 sur date inexistante", async () => {
    const res = await POST(req({ ...valid, date: "2026-02-30" }), ctx);
    expect(res.status).toBe(400);
    expect(h.createDraftEvent).not.toHaveBeenCalled();
  });

  it("400 sur type hérité", async () => {
    const res = await POST(req({ ...valid, type: "CONDAMNATION" }), ctx);
    expect(res.status).toBe(400);
  });

  it("400 sur précision de fin différente", async () => {
    const res = await POST(req({ ...valid, dateEnd: "2024-06-02" }), ctx);
    expect(res.status).toBe(400);
  });

  it("404 et 422", async () => {
    h.createDraftEvent.mockResolvedValueOnce({ ok: false, reason: "not_found" });
    expect((await POST(req(valid), ctx)).status).toBe(404);
    h.createDraftEvent.mockResolvedValueOnce({ ok: false, reason: "invalid", messages: ["m"] });
    const res = await POST(req(valid), ctx);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Étape invalide", reasons: ["m"] });
  });
});
