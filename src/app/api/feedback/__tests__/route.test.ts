import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const afterCallbacks: Array<() => Promise<void>> = [];

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (callback: () => Promise<void>) => {
    afterCallbacks.push(callback);
  },
}));

const create = vi.fn();
const update = vi.fn();
vi.mock("@/lib/db", () => ({ db: { visitorFeedback: { create, update } } }));

const createLinearIssue = vi.fn();
vi.mock("@/lib/api/linear", () => ({ createLinearIssue }));

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
    afterCallbacks.length = 0;
    create.mockResolvedValue({ id: "cfeedback1" });
    update.mockResolvedValue({});
    createLinearIssue.mockResolvedValue({ id: "i1", url: "https://linear.app/x/i1" });
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
      select: { id: true },
    });
  });

  it("crée l'issue Linear après la réponse, sans le message ni l'e-mail", async () => {
    await POST(request(valid), context);
    expect(createLinearIssue).not.toHaveBeenCalled();

    await afterCallbacks[0]!();

    expect(createLinearIssue).toHaveBeenCalledWith({
      id: "cfeedback1",
      category: "FACTUAL_ERROR",
      pagePath: "/politiques/yael-braun-pivet",
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "cfeedback1" },
      data: { linearIssueId: "i1", linearIssueUrl: "https://linear.app/x/i1" },
    });
  });

  it("garde le retour même quand Linear ne répond pas", async () => {
    createLinearIssue.mockResolvedValue(null);
    const response = await POST(request(valid), context);
    await afterCallbacks[0]!();
    expect(response.status).toBe(200);
    expect(update).not.toHaveBeenCalled();
  });

  it("répond comme un succès sans rien enregistrer quand le champ piège est rempli", async () => {
    const response = await POST(request({ ...valid, website: "http://spam.example" }), context);
    expect(response.status).toBe(200);
    expect(create).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(0);
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
