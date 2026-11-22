import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ isAuthenticated: vi.fn(), traiter: vi.fn() }));
vi.mock("@/lib/auth", () => ({ isAuthenticated: h.isAuthenticated }));
vi.mock("@/lib/territoires/rapports-crc-validation", () => ({ traiterRapportCrc: h.traiter }));

import { POST } from "../rapports-crc/[id]/route";

const ctx = { params: Promise.resolve({ id: "e1" }) };
const post = (body: unknown) =>
  new NextRequest("http://localhost/api/admin/territoires/rapports-crc/e1", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.isAuthenticated.mockResolvedValue(true);
  h.traiter.mockResolvedValue({ ok: true, id: "e1" });
});

describe("POST /api/admin/territoires/rapports-crc/[id]", () => {
  it("refuse une requête non authentifiée", async () => {
    h.isAuthenticated.mockResolvedValue(false);
    expect((await POST(post({ action: "REJETER", reason: "x" }), ctx)).status).toBe(401);
    expect(h.traiter).not.toHaveBeenCalled();
  });

  it.each([
    ["une action inconnue", { action: "FORCER" }],
    ["une publication sans relecteur", { action: "PUBLIER" }],
    ["un rejet sans motif", { action: "REJETER", reason: " " }],
    [
      "un code qui n'est pas INSEE",
      { action: "RATTACHER", territoryType: "COM", territoryCode: "../x" },
    ],
    ["un champ en trop", { action: "PUBLIER", reviewedBy: "L", status: "PUBLISHED" }],
  ])("refuse %s", async (_cas, body) => {
    expect((await POST(post(body), ctx)).status).toBe(400);
    expect(h.traiter).not.toHaveBeenCalled();
  });

  it("transmet l'action validée et renvoie le refus métier", async () => {
    h.traiter.mockResolvedValue({
      ok: false,
      httpStatus: 409,
      message: "Choisissez d'abord le territoire.",
    });
    const res = await POST(post({ action: "PUBLIER", reviewedBy: "Lamine" }), ctx);
    expect(res.status).toBe(409);
    expect(h.traiter.mock.calls[0]?.slice(0, 2)).toEqual([
      "e1",
      { action: "PUBLIER", reviewedBy: "Lamine" },
    ]);
  });
});
