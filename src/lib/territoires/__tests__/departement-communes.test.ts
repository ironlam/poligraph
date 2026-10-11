import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  departementCommunesHref,
  departementCommunesRewritePath,
  parseCommuneListSegments,
} from "../departement-communes";
import { proxy } from "@/proxy";

const rewrite = (url: string) => {
  const u = new URL(url, "https://poligraph.fr");
  return departementCommunesRewritePath(u.pathname, u.searchParams);
};

describe("departementCommunesHref", () => {
  it("omet la lettre absente et la page 1, ancre sur la liste", () => {
    expect(departementCommunesHref("eure", { letter: null, page: 1 })).toBe(
      "/territoires/departements/eure#communes"
    );
    expect(departementCommunesHref("eure", { letter: "E", page: 1 })).toBe(
      "/territoires/departements/eure?lettre=E#communes"
    );
    expect(departementCommunesHref("aisne", { letter: "M", page: 2 })).toBe(
      "/territoires/departements/aisne?lettre=M&page=2#communes"
    );
    expect(departementCommunesHref("aisne", { letter: null, page: 3 })).toBe(
      "/territoires/departements/aisne?page=3#communes"
    );
  });
});

describe("departementCommunesRewritePath", () => {
  it("laisse la page nue au route handler du département", () => {
    expect(rewrite("/territoires/departements/eure")).toBeNull();
    expect(rewrite("/territoires/departements/eure?page=1")).toBeNull();
    expect(rewrite("/territoires/departements/eure?page=abc")).toBeNull();
    expect(rewrite("/territoires/departements/eure?lettre=")).toBeNull();
    expect(rewrite("/territoires/departements/eure?utm_source=x")).toBeNull();
  });

  it("route une vue filtrée vers son segment interne", () => {
    expect(rewrite("/territoires/departements/eure?lettre=E")).toBe(
      "/territoires/departements/eure/communes/E/1"
    );
    expect(rewrite("/territoires/departements/aisne?lettre=M&page=2")).toBe(
      "/territoires/departements/aisne/communes/M/2"
    );
    expect(rewrite("/territoires/departements/aisne?page=3")).toBe(
      "/territoires/departements/aisne/communes/toutes/3"
    );
  });

  it("ne réécrit pas une lettre ou une page qui ne désigne aucune vue (écritures ISR)", () => {
    expect(rewrite("/territoires/departements/eure?lettre=zzz1")).toBeNull();
    expect(rewrite("/territoires/departements/eure?lettre=%2F..")).toBeNull();
    expect(rewrite("/territoires/departements/eure?lettre=E&page=100")).toBeNull();
    expect(rewrite("/territoires/departements/eure?lettre=E&page=2x")).toBeNull();
    expect(rewrite("/territoires/departements/eure?lettre=e")).toBe(
      "/territoires/departements/eure/communes/e/1"
    );
  });

  it("ne touche à aucune autre route", () => {
    expect(rewrite("/territoires/departements?lettre=A")).toBeNull();
    expect(rewrite("/territoires/departements/eure/opengraph-image?lettre=A")).toBeNull();
    expect(rewrite("/territoires/regions/normandie?lettre=A")).toBeNull();
    // The old address is redirected by next.config.ts before the proxy runs.
    expect(rewrite("/departements/eure?lettre=E")).toBeNull();
  });
});

describe("parseCommuneListSegments", () => {
  it("lit une lettre et une page valides", () => {
    expect(parseCommuneListSegments("M", "2")).toEqual({ letter: "M", page: 2 });
    expect(parseCommuneListSegments("e", "1")).toEqual({ letter: "E", page: 1 });
    expect(parseCommuneListSegments("toutes", "3")).toEqual({ letter: null, page: 3 });
  });

  it("refuse ce qui ne désigne aucune vue de la liste", () => {
    for (const [l, p] of [
      ["zz", "1"],
      ["É", "1"],
      ["M", "0"],
      ["M", "-1"],
      ["M", "100"],
      ["M", "2.5"],
      ["M", "02"],
    ]) {
      expect(parseCommuneListSegments(l!, p!), `${l}/${p}`).toBeNull();
    }
  });
});

describe("proxy : vues filtrées de la liste des communes", () => {
  const call = (url: string) =>
    proxy(new NextRequest(url), { waitUntil: () => {} } as never as Parameters<typeof proxy>[1]);

  it("réécrit en interne, sans redirection visible", async () => {
    const res = await call("https://poligraph.fr/territoires/departements/aisne?lettre=M&page=2");
    expect(res?.status).toBe(200);
    expect(res?.headers.get("location")).toBeNull();
    expect(res?.headers.get("x-middleware-rewrite")).toBe(
      "https://poligraph.fr/territoires/departements/aisne/communes/M/2"
    );
  });

  it("laisse passer la page nue", async () => {
    const res = await call("https://poligraph.fr/territoires/departements/aisne");
    expect(res?.headers.get("x-middleware-rewrite")).toBeNull();
  });
});
