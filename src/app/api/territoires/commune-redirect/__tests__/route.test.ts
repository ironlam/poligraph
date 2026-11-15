import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { commune: { findUnique: h.findUnique } } }));

import { GET } from "../route";
import { proxy } from "@/proxy";

const get = (query: string) =>
  GET(new NextRequest(`https://poligraph.fr/api/territoires/commune-redirect?${query}`), {
    params: Promise.resolve({}),
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.findUnique.mockResolvedValue({ name: "Brest" });
});

describe("redirection des anciennes adresses de commune", () => {
  it("répond un vrai 308 vers l'adresse lisible, sur la même origine", async () => {
    const res = await get("code=29019&suite=");
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(
      "https://poligraph.fr/territoires/communes/brest-29019"
    );
    expect(h.findUnique).toHaveBeenCalledWith({ where: { id: "29019" }, select: { name: true } });
  });

  // Régression : derrière la réécriture du proxy, la requête garde son adresse d'origine et la
  // chaîne de requête réécrite n'arrive pas. Vu en HTTP réel : 400 au lieu de 308.
  it("lit l'adresse d'origine quand la requête arrive par la réécriture du proxy", async () => {
    const res = await GET(
      new NextRequest("https://poligraph.fr/territoires/communes/29019/elections"),
      {
        params: Promise.resolve({}),
      }
    );
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(
      "https://poligraph.fr/territoires/communes/brest-29019/elections"
    );
  });

  it("garde la chaîne de requête de l'ancienne adresse", async () => {
    const res = await GET(
      new NextRequest("https://poligraph.fr/territoires/communes/29019/elections?type=municipales"),
      { params: Promise.resolve({}) }
    );
    expect(res.headers.get("location")).toBe(
      "https://poligraph.fr/territoires/communes/brest-29019/elections?type=municipales"
    );
  });

  it("garde la sous-page et se laisse mettre en cache", async () => {
    const res = await get("code=29019&suite=%2Felections");
    expect(res.headers.get("location")).toBe(
      "https://poligraph.fr/territoires/communes/brest-29019/elections"
    );
    expect(res.headers.get("cache-control")).toContain("s-maxage=86400");
  });

  it("répond 404 pour une commune inconnue, sans redirection", async () => {
    h.findUnique.mockResolvedValueOnce(null);
    const res = await get("code=99999&suite=");
    expect(res.status).toBe(404);
    expect(res.headers.get("location")).toBeNull();
  });

  it("refuse un code ou une suite hors forme sans lire la base", async () => {
    for (const query of [
      "code=brest&suite=",
      "code=29019&suite=%2F..%2Fadmin",
      "code=29019&suite=%2F%2Fevil.example",
      "suite=",
    ]) {
      const res = await get(query);
      expect(res.status, query).toBe(400);
    }
    expect(h.findUnique).not.toHaveBeenCalled();
  });
});

describe("proxy : ancienne adresse de commune", () => {
  const call = (path: string) =>
    proxy(new NextRequest(`https://poligraph.fr${path}`), {
      waitUntil: () => {},
    } as never as Parameters<typeof proxy>[1]);

  it("réécrit le code nu vers le Route Handler, avec le code et la sous-page", async () => {
    const res = await call("/territoires/communes/29019/elections");
    const rewrite = new URL(res!.headers.get("x-middleware-rewrite")!);
    expect(rewrite.pathname).toBe("/api/territoires/commune-redirect");
    expect(rewrite.searchParams.get("code")).toBe("29019");
    expect(rewrite.searchParams.get("suite")).toBe("/elections");
  });

  it("ne touche pas à l'adresse lisible", async () => {
    const res = await call("/territoires/communes/brest-29019");
    expect(res?.headers.get("x-middleware-rewrite")).toBeNull();
  });
});
