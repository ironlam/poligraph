import { createRequire } from "node:module";
import { describe, it, expect } from "vitest";
import { OG_IMAGE_NOINDEX_HEADERS, OG_IMAGE_ROBOTS_SOURCE } from "../og-image-robots";

// Compile the header `source` with the exact matcher Next uses for custom routes, so
// the test reflects real production matching rather than a hand-rolled approximation.
const require = createRequire(import.meta.url);
const { pathToRegexp } = require("next/dist/compiled/path-to-regexp") as {
  pathToRegexp: (path: string, keys?: unknown[], opts?: Record<string, unknown>) => RegExp;
};
const source = pathToRegexp(OG_IMAGE_ROBOTS_SOURCE, [], {
  delimiter: "/",
  sensitive: false,
  strict: false,
});

describe("opengraph-image noindex header", () => {
  it("tags every rule with X-Robots-Tag: noindex", () => {
    expect(OG_IMAGE_NOINDEX_HEADERS.length).toBeGreaterThan(0);
    for (const rule of OG_IMAGE_NOINDEX_HEADERS) {
      expect(rule.headers).toContainEqual({ key: "X-Robots-Tag", value: "noindex" });
    }
  });

  // Every opengraph-image family must be covered: root, static, and the dynamic
  // /parlement/votes + /parlement/dossiers routes that dominate the Coverage noise.
  it.each([
    "/opengraph-image",
    "/parlement/opengraph-image",
    "/programmes/opengraph-image",
    "/affaires/condamnations/opengraph-image",
    "/parlement/votes/loi-de-finances-2026/opengraph-image",
    "/parlement/dossiers/reforme-des-retraites/opengraph-image",
    "/partis/renaissance/programme/opengraph-image",
    "/politiques/jean-dupont/opengraph-image",
    "/elections/presidentielle-2027/opengraph-image",
    // Four segments deep, the deepest OG route on the site: the `:path*` prefix has to
    // stay unbounded, or every candidacy card would be crawled and indexed as an image.
    "/elections/presidentielle-2027/candidats/marine-tondelier/opengraph-image",
  ])("noindexes OG image path %s", (path) => {
    expect(source.test(path)).toBe(true);
  });

  // Real pages (including the parents of the OG images) must stay indexable.
  it.each([
    "/parlement/votes/loi-de-finances-2026",
    "/parlement/dossiers/reforme-des-retraites",
    "/parlement",
    "/politiques/jean-dupont",
    "/elections/presidentielle-2027/candidats/marine-tondelier",
    "/opengraph-image-gallery",
  ])("leaves real page %s indexable", (path) => {
    expect(source.test(path)).toBe(false);
  });
});
