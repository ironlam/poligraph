import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SW_CACHE_VERSION, DOCUMENT_CACHE, STATIC_CACHE, MAX_DOCUMENTS } from "./sw-config";

const SW_SOURCE = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");

describe("sw.js drift guard", () => {
  it("partage la version de cache avec sw-config.ts", () => {
    expect(SW_SOURCE).toContain(`const SW_CACHE_VERSION = "${SW_CACHE_VERSION}";`);
  });

  it("partage les noms de cache calculés", () => {
    expect(SW_SOURCE).toContain("const DOCUMENT_CACHE = `poligraph-docs-${SW_CACHE_VERSION}`;");
    expect(SW_SOURCE).toContain("const STATIC_CACHE = `poligraph-static-${SW_CACHE_VERSION}`;");
    expect(DOCUMENT_CACHE).toBe("poligraph-docs-v2");
    expect(STATIC_CACHE).toBe("poligraph-static-v2");
  });

  it("partage la limite LRU MAX_DOCUMENTS", () => {
    expect(SW_SOURCE).toContain(`const MAX_DOCUMENTS = ${MAX_DOCUMENTS};`);
  });

  it("partage les regex de documents cachables", () => {
    expect(SW_SOURCE).toContain("/^\\/politiques\\/[^/]+$/");
    expect(SW_SOURCE).toContain("/^\\/affaires\\/[^/]+$/");
  });

  it("partage les regex d'assets statiques", () => {
    expect(SW_SOURCE).toContain("/^\\/_next\\/static\\//");
    expect(SW_SOURCE).toContain("/^\\/icon-\\d+\\.png$/");
    expect(SW_SOURCE).toContain("/^\\/logo\\.(svg|png)$/");
    expect(SW_SOURCE).toContain("/^\\/apple-icon/");
    expect(SW_SOURCE).toContain("/^\\/manifest\\.webmanifest$/");
    expect(SW_SOURCE).toContain("/^\\/favicon\\./");
  });

  it("expose les trois prédicats avec les mêmes implémentations", () => {
    expect(SW_SOURCE).toContain("function isCacheableDocument(pathname)");
    expect(SW_SOURCE).toContain("function isApiRoute(pathname)");
    expect(SW_SOURCE).toContain("function isStaticAsset(pathname)");
  });
});
