import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  isAuthenticated: vi.fn(),
  markReviewedNoChange: vi.fn(),
  deferReview: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ isAuthenticated: h.isAuthenticated }));
vi.mock("@/services/affairs/monitoring/actions", () => ({
  markReviewedNoChange: h.markReviewedNoChange,
  deferReview: h.deferReview,
}));

import { POST } from "./route";

const KEY = "2f0c8f0e-9d0b-4a3e-8f55-1f1b6d9f5a11";

function call(body: unknown) {
  return POST(
    new NextRequest("https://poligraph.fr/api/admin/affaires/affair-1/suivi", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id: "affair-1" }) }
  );
}

describe("POST /api/admin/affaires/[id]/suivi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.isAuthenticated.mockResolvedValue(true);
  });

  it("refuse sans session", async () => {
    h.isAuthenticated.mockResolvedValue(false);
    const res = await call({ action: "NO_CHANGE", requestKey: KEY });
    expect(res.status).toBe(401);
    expect(h.markReviewedNoChange).not.toHaveBeenCalled();
  });

  it("rejette une date impossible", async () => {
    const res = await call({
      action: "DEFER",
      requestKey: KEY,
      nextReviewAt: "2026-13-40",
      dueReason: "MANUEL",
    });
    expect(res.status).toBe(400);
    expect(h.deferReview).not.toHaveBeenCalled();
  });

  it("rejette le 30 février", async () => {
    const res = await call({
      action: "DEFER",
      requestKey: KEY,
      nextReviewAt: "2026-02-30",
      dueReason: "MANUEL",
    });
    expect(res.status).toBe(400);
  });

  it("rejette une note de 141 caractères", async () => {
    const res = await call({
      action: "DEFER",
      requestKey: KEY,
      nextReviewAt: "2026-12-01",
      dueReason: "AUDIENCE",
      dueNote: "x".repeat(141),
    });
    expect(res.status).toBe(400);
  });

  it("traduit date_not_future en 422", async () => {
    h.deferReview.mockResolvedValue({ ok: false, reason: "date_not_future" });
    const res = await call({
      action: "DEFER",
      requestKey: KEY,
      nextReviewAt: "2026-12-01",
      dueReason: "DELIBERE",
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ reason: "date_not_future" });
  });

  it("traduit key_conflict en 409", async () => {
    h.markReviewedNoChange.mockResolvedValue({ ok: false, reason: "key_conflict" });
    const res = await call({ action: "NO_CHANGE", requestKey: KEY });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reason: "key_conflict" });
  });

  it("traduit no_monitoring et not_found en 404", async () => {
    h.markReviewedNoChange.mockResolvedValueOnce({ ok: false, reason: "no_monitoring" });
    expect((await call({ action: "NO_CHANGE", requestKey: KEY })).status).toBe(404);
    h.markReviewedNoChange.mockResolvedValueOnce({ ok: false, reason: "not_found" });
    expect((await call({ action: "NO_CHANGE", requestKey: KEY })).status).toBe(404);
  });

  it("renvoie deduped et passe les paramètres au service", async () => {
    h.deferReview.mockResolvedValue({ ok: true, deduped: true });
    const res = await call({
      action: "DEFER",
      requestKey: KEY,
      nextReviewAt: "2026-12-01",
      dueReason: "AUDIENCE",
      dueNote: "Audience fixée",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deduped: true });
    expect(h.deferReview).toHaveBeenCalledWith({
      affairId: "affair-1",
      requestKey: KEY,
      actorId: "admin",
      nextReviewAt: new Date("2026-12-01T00:00:00Z"),
      dueReason: "AUDIENCE",
      dueNote: "Audience fixée",
    });
  });
});
