import { afterEach, describe, expect, it, vi } from "vitest";
import { createOfglClient, OFGL_RECORDS_WINDOW, OfglError } from "../ofgl";
import brest from "../__fixtures__/ofgl/records-brest-2024.json";
import error400 from "../__fixtures__/ofgl/error-400.json";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function stubFetch(handler: (url: URL) => Response | Promise<Response>) {
  const calls: URL[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      calls.push(url);
      return handler(url);
    })
  );
  return calls;
}

const client = () => createOfglClient({ retryDelayMs: 0 });
const QUERY = { where: 'year(exer)=2024 and insee="29019"', select: "insee,agregat,montant" };

afterEach(() => vi.unstubAllGlobals());

describe("client OFGL", () => {
  it("lit un extrait réel sur l'hôte fixe, filtre encodé", async () => {
    const calls = stubFetch(() => json(brest));
    const rows = await client().records("ofgl-base-communes-consolidee", QUERY);

    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.agregat)).toContain("Epargne brute");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.origin).toBe("https://data.ofgl.fr");
    expect(calls[0]?.pathname).toBe(
      "/api/explore/v2.1/catalog/datasets/ofgl-base-communes-consolidee/records"
    );
    expect(calls[0]?.searchParams.get("where")).toBe(QUERY.where);
    expect(calls[0]?.searchParams.get("limit")).toBe("100");
  });

  it("refuse un identifiant de jeu qui sortirait du chemin", async () => {
    const calls = stubFetch(() => json(brest));
    for (const id of ["../secrets", "a/b", "Jeu", "https://evil.example"]) {
      await expect(client().records(id, {})).rejects.toMatchObject({ kind: "REQUETE" });
    }
    expect(calls).toHaveLength(0);
  });

  it("parcourt toutes les pages et vérifie le total annoncé", async () => {
    const calls = stubFetch((url) => {
      const offset = Number(url.searchParams.get("offset"));
      const n = Math.min(100, 250 - offset);
      return json({
        total_count: 250,
        results: Array.from({ length: n }, (_, i) => ({ i: offset + i })),
      });
    });
    const rows = await client().records("ofgl-base-departements-consolidee", {});
    expect(rows).toHaveLength(250);
    expect(calls.map((c) => c.searchParams.get("offset"))).toEqual(["0", "100", "200"]);
  });

  it("signale un total qui change pendant la lecture", async () => {
    stubFetch((url) =>
      json({
        total_count: 150,
        results: url.searchParams.get("offset") === "0" ? Array(100).fill({}) : [],
      })
    );
    await expect(client().records("ofgl-base-regions-consolidee", {})).rejects.toMatchObject({
      kind: "REPONSE",
    });
  });

  it("refuse de paginer au-delà de la fenêtre de l'API et renvoie vers l'export", async () => {
    const calls = stubFetch(() => json({ total_count: OFGL_RECORDS_WINDOW + 1, results: [] }));
    const err = await client()
      .records("ofgl-base-communes-consolidee", {})
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OfglError);
    expect((err as OfglError).kind).toBe("LIMITE");
    expect((err as OfglError).message).toMatch(/exportRows/);
    expect(calls).toHaveLength(1);
  });

  it("traduit un refus de requête sans réessayer", async () => {
    const calls = stubFetch(() => json(error400, 400));
    const err = (await client()
      .records("ofgl-base-communes-consolidee", { where: 'exer="2024"' })
      .catch((e: unknown) => e)) as OfglError;
    expect(err.kind).toBe("REQUETE");
    expect(err.message).toMatch(/HTTP 400/);
    expect(err.message).toMatch(/year\(exer\)/);
    expect(calls).toHaveLength(1);
  });

  it("dit clairement quand data.ofgl.fr est injoignable", async () => {
    const calls = stubFetch(() => {
      throw new TypeError("fetch failed", {
        cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
      });
    });
    const err = (await client()
      .exportRows("ofgl-base-communes-consolidee", QUERY)
      .catch((e: unknown) => e)) as OfglError;
    expect(err.kind).toBe("RESEAU");
    expect(err.message).toMatch(/impossible de joindre data\.ofgl\.fr/);
    expect(err.message).toMatch(/ECONNREFUSED/);
    expect(calls).toHaveLength(4);
  });

  it("lit un export complet et refuse une réponse qui n'est pas une liste", async () => {
    const calls = stubFetch(() => json(brest.results));
    const rows = await client().exportRows("ofgl-base-communes-consolidee", QUERY);
    expect(rows).toHaveLength(5);
    expect(calls[0]?.pathname).toMatch(/\/exports\/json$/);
    expect(calls[0]?.searchParams.has("limit")).toBe(false);

    stubFetch(() => json({ results: [] }));
    await expect(client().exportRows("ofgl-base-communes-consolidee", QUERY)).rejects.toMatchObject(
      {
        kind: "REPONSE",
      }
    );
  });
});
