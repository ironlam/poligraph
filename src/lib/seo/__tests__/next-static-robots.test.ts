import { createRequire } from "node:module";
import { describe, it, expect } from "vitest";
import { NEXT_STATIC_NOINDEX_HEADERS, NEXT_STATIC_ROBOTS_SOURCE } from "../next-static-robots";

// Compile the header `source` with the exact matcher Next uses for custom routes, so
// the test reflects real production matching rather than a hand-rolled approximation.
const require = createRequire(import.meta.url);
const { pathToRegexp } = require("next/dist/compiled/path-to-regexp") as {
  pathToRegexp: (path: string, keys?: unknown[], opts?: Record<string, unknown>) => RegExp;
};
const source = pathToRegexp(NEXT_STATIC_ROBOTS_SOURCE, [], {
  delimiter: "/",
  sensitive: false,
  strict: false,
});

describe("/_next/static noindex header", () => {
  it("tags every rule with X-Robots-Tag: noindex", () => {
    expect(NEXT_STATIC_NOINDEX_HEADERS.length).toBeGreaterThan(0);
    for (const rule of NEXT_STATIC_NOINDEX_HEADERS) {
      expect(rule.headers).toContainEqual({ key: "X-Robots-Tag", value: "noindex" });
    }
  });

  it.each([
    "/_next/static/chunks/main-abc123.js",
    "/_next/static/css/app-def456.css",
    "/_next/static/media/font-ghi789.woff2",
    "/_next/static/AbCdEfGhIjKlMnOpQrStU/_buildManifest.js",
  ])("noindexes static asset path %s", (path) => {
    expect(source.test(path)).toBe(true);
  });

  // Real pages, and the sibling /_next/image and /_next/data routes, must stay
  // untouched: only the immutable, hashed build output under /_next/static/ is thin.
  it.each(["/parlement/votes", "/_next/image", "/_next/data/build-id/politiques.json"])(
    "leaves %s indexable",
    (path) => {
      expect(source.test(path)).toBe(false);
    }
  );
});
