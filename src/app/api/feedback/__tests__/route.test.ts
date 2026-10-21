import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const create = vi.fn();
vi.mock("@/lib/db", () => ({ db: { visitorFeedback: { create } } }));

const { POST } = await import("../route");

function request(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("https://poligraph.fr/api/feedback", {
    method: "POST",
    headers: { "content-type": "application/json", host: "poligraph.fr", ...headers },
    body: JSON.stringify(body),
  });
}

const valid = {
  category: "FACTUAL_ERROR",
  message: "Le mandat indiqué est daté de travers.",
  pagePath: "/politiques/yael-braun-pivet?q=secret",
  contactEmail: "marie@example.org",
};

const context = { params: Promise.resolve({}) };

describe("POST /api/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue({ id: "cfeedback1" });
  });

  it("enregistre le retour avec un chemin sans paramètres de requête", async () => {
    const response = await POST(request(valid, { origin: "https://poligraph.fr" }), context);

    expect(response.status).toBe(200);
    expect(create).toHaveBeenCalledWith({
      data: {
        category: "FACTUAL_ERROR",
        message: valid.message,
        pagePath: "/politiques/yael-braun-pivet",
        contactEmail: "marie@example.org",
      },
    });
  });

  it("répond comme un succès sans rien enregistrer quand le champ piège est rempli", async () => {
    const response = await POST(request({ ...valid, website: "http://spam.example" }), context);
    expect(response.status).toBe(200);
    expect(create).not.toHaveBeenCalled();
  });

  it("refuse une requête venue d'une autre origine", async () => {
    const response = await POST(request(valid, { origin: "https://evil.example" }), context);
    expect(response.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("refuse un message invalide", async () => {
    const response = await POST(request({ ...valid, message: "court" }), context);
    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("répond 503 quand la table n'existe pas encore", async () => {
    create.mockRejectedValue({
      meta: { driverAdapterError: { cause: { kind: "TableDoesNotExist" } } },
    });
    const response = await POST(request(valid), context);
    expect(response.status).toBe(503);
  });
});
