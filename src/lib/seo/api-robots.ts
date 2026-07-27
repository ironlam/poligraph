/**
 * Route Handlers under /api are machine endpoints: JSON payloads, CSV exports,
 * the OpenAPI schema. They are linked from the site (the /docs/api page shows
 * copy-pastable export URLs), so crawlers follow them and Search Console files
 * them under "Explorée, actuellement non indexée" — /api/export/politiques and
 * /api/export/factchecks?limit=10000 both show up in the 2026-07 Coverage
 * drilldown.
 *
 * `X-Robots-Tag: noindex` is the right tool rather than a robots.txt Disallow:
 * the endpoints must stay fetchable (they are the public data API) while never
 * competing with a real page in the index.
 *
 * The human-readable API documentation lives at /docs/api, outside this prefix,
 * and stays indexable.
 */

// Structural subset of Next's custom-route Header type, mirroring og-image-robots.
type NextHeaderRule = {
  source: string;
  headers: Array<{ key: string; value: string }>;
};

export const API_ROBOTS_SOURCE = "/api/:path*";

export const API_NOINDEX_HEADERS: NextHeaderRule[] = [
  {
    source: API_ROBOTS_SOURCE,
    headers: [{ key: "X-Robots-Tag", value: "noindex" }],
  },
];
