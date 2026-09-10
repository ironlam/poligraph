/**
 * `/_next/static/*` (JS/CSS chunks, fonts, build manifests) gets crawled like any other
 * linked URL and Search Console files ~6.8K of them under "Explorée, actuellement non
 * indexée". They are build artefacts, not pages, and must never compete with real
 * content in the index.
 *
 * `X-Robots-Tag: noindex` is the right tool, not a robots.txt `Disallow`: Googlebot must
 * keep fetching these assets to render the page (CSS/JS drive the rendered DOM Google
 * scores), so blocking the crawl would break rendering. noindex only tells the indexer
 * to drop the URL itself; it has no effect on whether the asset is fetched or on the
 * `Cache-Control: public, max-age=31536000, immutable` header Next.js already sets on
 * these files (different header key, so both apply).
 */

// Structural subset of Next's custom-route Header type, mirroring og-image-robots.
type NextHeaderRule = {
  source: string;
  headers: Array<{ key: string; value: string }>;
};

export const NEXT_STATIC_ROBOTS_SOURCE = "/_next/static/:path*";

export const NEXT_STATIC_NOINDEX_HEADERS: NextHeaderRule[] = [
  {
    source: NEXT_STATIC_ROBOTS_SOURCE,
    headers: [{ key: "X-Robots-Tag", value: "noindex" }],
  },
];
