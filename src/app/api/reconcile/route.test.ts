import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  db: { politician: { findMany } },
}));

import { GET, POST } from "./route";

const context = { params: Promise.resolve({}) };
const validQueries = { q0: { query: "Jane Doe", limit: 1 } };

function postRequest(body: string): NextRequest {
  return new NextRequest("http://localhost/api/reconcile", {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/reconcile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
  });

  it.each(["{invalid", ""])("retourne 400 pour le corps JSON invalide %j", async (body) => {
    const response = await POST(postRequest(body), context);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON" });
    expect(findMany).not.toHaveBeenCalled();
  });

  it.each(["null", "[]"])(
    "retourne l'erreur de validation pour la valeur JSON incompatible %s",
    async (body) => {
      const response = await POST(postRequest(body), context);

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "Invalid queries format" });
      expect(findMany).not.toHaveBeenCalled();
    }
  );

  it("conserve l'erreur de validation pour un objet au mauvais schéma", async () => {
    const response = await POST(
      postRequest(JSON.stringify({ queries: { q0: { query: "" } } })),
      context
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "Invalid queries format" });
    expect(findMany).not.toHaveBeenCalled();
  });

  it.each([
    ["l'enveloppe queries", { queries: validQueries }],
    ["la map directement à la racine", validQueries],
  ])("accepte %s", async (_label, body) => {
    const response = await POST(postRequest(JSON.stringify(body)), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ q0: { result: [] } });
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/reconcile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("conserve le 400 et le message du paramètre JSON invalide", async () => {
    const url = new URL("http://localhost/api/reconcile");
    url.searchParams.set("queries", "{invalid");

    const response = await GET(new NextRequest(url), context);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid JSON in queries parameter",
    });
    expect(findMany).not.toHaveBeenCalled();
  });
});
