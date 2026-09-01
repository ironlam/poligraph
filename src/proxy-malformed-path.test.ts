import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { hasEncodedBackslash, proxy } from "@/proxy";

// A raw backslash never reaches the app: the WHATWG URL parser turns
// "https://host/a\" into "/a/". Only the percent-encoded form survives, which is
// what the production log of 2026-09-01 shows on 15 distinct paths.
describe("hasEncodedBackslash", () => {
  it("repère la forme encodée, majuscule et minuscule", () => {
    expect(hasEncodedBackslash("/parlement/votes%5C")).toBe(true);
    expect(hasEncodedBackslash("/parlement/votes%5c")).toBe(true);
    expect(hasEncodedBackslash("/affaires%5C%5C%5C")).toBe(true);
    expect(hasEncodedBackslash("/elections/municipales-2026/maires%5C")).toBe(true);
  });

  it("laisse passer les chemins légitimes", () => {
    expect(hasEncodedBackslash("/parlement/votes")).toBe(false);
    expect(hasEncodedBackslash("/")).toBe(false);
    expect(hasEncodedBackslash("/affaires/renaud-muselier-prise-illegale-interets")).toBe(false);
    // %5B / %5D (crochets) et %20 ne doivent pas déclencher la garde.
    expect(hasEncodedBackslash("/recherche%20avancee")).toBe(false);
    expect(hasEncodedBackslash("/tag%5Bfoo%5D")).toBe(false);
  });
});

describe("proxy : un chemin malformé sort en 404, pas en 500", () => {
  const call = (url: string) =>
    proxy(new NextRequest(url), { waitUntil: () => {} } as never as Parameters<typeof proxy>[1]);

  it("renvoie 404 sur les chemins vus en production", async () => {
    for (const p of [
      "/parlement/votes%5C",
      "/affaires%5C",
      "/statistiques%5C%5C%5C",
      "/elections/presidentielle-2027/candidats%5C",
    ]) {
      const res = await call(`https://poligraph.fr${p}`);
      expect(res?.status, p).toBe(404);
    }
  });

  it("ne renvoie pas 404 sur un chemin légitime", async () => {
    const res = await call("https://poligraph.fr/parlement/votes");
    expect(res?.status).not.toBe(404);
  });
});
