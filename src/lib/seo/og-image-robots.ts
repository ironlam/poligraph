/**
 * Next.js turns every route's `opengraph-image` file into a real URL and injects it as
 * an `<meta property="og:image">` tag. Search engines then crawl those image URLs like
 * ordinary pages, which floods Search Console Coverage with "crawled, currently not
 * indexed" entries. The bulk sits under /parlement/votes and /parlement/dossiers, where
 * every scrutin and dossier ships its own generated image.
 *
 * Tagging the image responses with `X-Robots-Tag: noindex` tells indexers to drop the
 * image URLs. Social crawlers (Facebook, X, LinkedIn, Slack, Discord, WhatsApp) still
 * download the bytes for link previews: noindex is an indexing directive, not an access
 * restriction, so previews are unaffected.
 *
 * `OG_IMAGE_ROBOTS_SOURCE` matches any path ending in `/opengraph-image` (root, static
 * and dynamic segments alike) and nothing else. Verified against Next's own route matcher
 * in `src/lib/seo/__tests__/og-image-robots.test.ts`.
 *
 * The header alone was not enough. `noindex` keeps the URLs out of the index but still
 * costs a crawl — and every crawl re-runs a full ImageResponse render. The 2026-08-04
 * Coverage export measured ~85% of the 18,589 "crawled, currently not indexed" URLs as
 * opengraph-image routes (mostly under /parlement/votes), i.e. roughly 15K URLs of pure
 * crawl waste against ~2K pages of real content. That budget has to come back, so
 * `OG_IMAGE_DISALLOW_PATHS` also blocks the crawl in robots.txt for generic user agents.
 * Link previews survive because `SOCIAL_PREVIEW_USER_AGENTS` gets its own robots.txt
 * group without that rule (a crawler obeys the most specific group that names it, and
 * ignores every other one).
 */

// Structural subset of Next's custom-route Header type (source + headers are the only
// required fields; has/missing/locale/basePath stay optional and unused here).
type NextHeaderRule = {
  source: string;
  headers: Array<{ key: string; value: string }>;
};

export const OG_IMAGE_ROBOTS_SOURCE = "/:path*/opengraph-image";

export const OG_IMAGE_NOINDEX_HEADERS: NextHeaderRule[] = [
  {
    source: OG_IMAGE_ROBOTS_SOURCE,
    headers: [{ key: "X-Robots-Tag", value: "noindex" }],
  },
];

/**
 * robots.txt `Disallow` patterns covering the same routes as OG_IMAGE_ROBOTS_SOURCE.
 * Two entries because robots.txt matching is prefix-based with a literal leading `/`:
 * `/*​/opengraph-image` cannot also cover the root-level `/opengraph-image`. Neither
 * needs a trailing wildcard — the prefix already swallows Next's `?<buildHash>` suffix.
 */
export const OG_IMAGE_DISALLOW_PATHS = ["/opengraph-image", "/*/opengraph-image"] as const;

/**
 * User agents that fetch og:image to render a link preview. All of them honour
 * robots.txt, so each needs a group that omits OG_IMAGE_DISALLOW_PATHS or the previews
 * break. They keep every other site-wide rule (see buildDisallowRules in robots.ts).
 */
export const SOCIAL_PREVIEW_USER_AGENTS = [
  "facebookexternalhit",
  "facebookcatalog",
  "Twitterbot",
  "LinkedInBot",
  "Slackbot",
  "Slackbot-LinkExpanding",
  "Discordbot",
  "WhatsApp",
  "TelegramBot",
  "Pinterestbot",
  "redditbot",
  "Applebot",
  "Mastodon",
  "Bluesky",
] as const;
