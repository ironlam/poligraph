import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { commune: { findUnique: h.findUnique } } }));

import { GET } from "../route";
import { proxy } from "@/proxy";
import { communeCodeFromSegment, legacyCommunePath } from "@/lib/territoires/paths";

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

  // Régression (prod, 2026-11-15) : Vercel livre l'adresse d'origine AVEC les paramètres ajoutés
  // par la réécriture du proxy. Ils partaient dans la destination : `brest-29019?code=29019&suite=`.
  describe("requête telle que la prod la livre : chemin d'origine, chaîne fusionnée", () => {
    const viaProd = (pathAndQuery: string) =>
      GET(new NextRequest(`https://poligraph.fr${pathAndQuery}`), { params: Promise.resolve({}) });

    it("ne recopie ni `code` ni `suite` dans la destination", async () => {
      const res = await viaProd("/territoires/communes/29019?code=29019&suite=");
      expect(res.status).toBe(308);
      expect(res.headers.get("location")).toBe(
        "https://poligraph.fr/territoires/communes/brest-29019"
      );
    });

    it("garde `?type=` et rien d'autre sur la page des élections", async () => {
      const res = await viaProd(
        "/territoires/communes/29019/elections?type=presidentielle&code=29019&suite=%2Felections"
      );
      expect(res.headers.get("location")).toBe(
        "https://poligraph.fr/territoires/communes/brest-29019/elections?type=presidentielle"
      );
    });

    it("garde la sous-page des décisions", async () => {
      const res = await viaProd(
        "/territoires/communes/29019/decisions?code=29019&suite=%2Fdecisions"
      );
      expect(res.headers.get("location")).toBe(
        "https://poligraph.fr/territoires/communes/brest-29019/decisions"
      );
    });

    it("redirige un code corse", async () => {
      h.findUnique.mockResolvedValueOnce({ name: "Ajaccio" });
      const res = await viaProd(
        "/territoires/communes/2A004/elections?code=2A004&suite=%2Felections"
      );
      expect(res.headers.get("location")).toBe(
        "https://poligraph.fr/territoires/communes/ajaccio-2A004/elections"
      );
      expect(h.findUnique).toHaveBeenCalledWith({ where: { id: "2A004" }, select: { name: true } });
    });

    it("ne suit que le code du chemin quand un visiteur passe son propre `?code=`", async () => {
      const res = await viaProd("/territoires/communes/29019?code=75056&suite=%2Fdecisions&x=1");
      expect(h.findUnique).toHaveBeenCalledWith({ where: { id: "29019" }, select: { name: true } });
      expect(res.headers.get("location")).toBe(
        "https://poligraph.fr/territoires/communes/brest-29019?x=1"
      );
    });
  });

  it("garde la sous-page et se laisse mettre en cache", async () => {
    const res = await get("code=29019&suite=%2Felections");
    expect(res.headers.get("location")).toBe(
      "https://poligraph.fr/territoires/communes/brest-29019/elections"
    );
    expect(res.headers.get("cache-control")).toContain("s-maxage=86400");
  });

  // Régression (prod, 2026-11-15) : la route répondait elle-même, en JSON. Un visiteur voyait
  // `{"error":"Commune introuvable"}`. Une route ne sait pas rendre la page 404 du site : elle
  // renvoie donc vers une adresse de forme lisible, où la page rend son not-found.
  describe("commune inconnue", () => {
    beforeEach(() => h.findUnique.mockResolvedValue(null));
    const unknown = (pathAndQuery: string) =>
      GET(new NextRequest(`https://poligraph.fr${pathAndQuery}`), { params: Promise.resolve({}) });

    it("renvoie vers la page, qui rend le 404 du site, au lieu de répondre en JSON", async () => {
      const res = await unknown("/territoires/communes/99999?code=99999&suite=");
      expect(res.status).toBe(307);
      expect(res.headers.get("content-type")).toBeNull();
      expect(res.headers.get("location")).toBe(
        "https://poligraph.fr/territoires/communes/commune-99999"
      );
    });

    it("garde la sous-page", async () => {
      const res = await unknown("/territoires/communes/99999/elections?suite=%2Felections");
      expect(res.headers.get("location")).toBe(
        "https://poligraph.fr/territoires/communes/commune-99999/elections"
      );
    });

    it("ne boucle pas : le proxy ne réécrit pas l'adresse de destination", async () => {
      const res = await unknown("/territoires/communes/99999");
      const { pathname } = new URL(res.headers.get("location")!);
      expect(legacyCommunePath(pathname)).toBeNull();
      expect(communeCodeFromSegment(pathname.split("/").pop()!)).toBe("99999");
    });
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
