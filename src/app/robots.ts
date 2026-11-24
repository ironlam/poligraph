import { MetadataRoute } from "next";
import { SITE_URL } from "@/config/site";
import { OG_IMAGE_DISALLOW_PATHS, SOCIAL_PREVIEW_USER_AGENTS } from "@/lib/seo/og-image-robots";
import { VOTES_LISTING_FILTER_KEYS } from "@/lib/seo/listing-filters";
import { SITEMAP_SHARD_IDS } from "@/lib/seo/sitemap-tags";

const isProduction =
  process.env.VERCEL_ENV === "production" ||
  (!process.env.VERCEL_ENV && SITE_URL.includes("poligraph.fr") && !SITE_URL.includes("staging"));

/**
 * Crawl-blocked paths that every user agent gets, social preview bots included.
 *
 * These are the rules where blocking the fetch is the point (private surfaces, dead
 * archives, duplicate pagination), as opposed to OG_IMAGE_DISALLOW_PATHS below, which
 * only targets indexers.
 */
const SHARED_DISALLOW = [
  "/admin/",
  "/api/admin/",
  // Historical municipal elections never change: block crawl so bots
  // stop triggering ISR regenerations on ~70K dead commune pages.
  "/elections/municipales-2014/",
  "/elections/municipales-2020/",
  // Paginated listings are duplicate content (canonical points to
  // page 1): block crawl to avoid regenerating every ?page= variant.
  "/*?*page=",
  // The feedback form is linked from every page with a `?from=` of its own, so one address per
  // page of the site, each rendered on demand. It was already noindex: nothing to lose in the
  // index, and the crawl was the cost.
  "/signaler",
];

/**
 * The /parlement/votes facet space, one `Disallow` per filter key.
 *
 * Every one of these URLs already emits noindex,follow (see listingRobotsMetadata in
 * the page) and every one of them canonicalises to a filter-free sibling, yet Search
 * Console still files thousands of them under "alternate page with proper canonical",
 * because noindex and rel=canonical both cost a crawl before they can say anything. The
 * filters combine (chamber x legislature x result x theme x type), so the crawlable
 * surface grows multiplicatively while the whole facet space earns no clicks at all.
 * Blocking the fetch is what actually returns the budget to real pages.
 *
 * Scoped to the `?` boundary on purpose: `/parlement/votes/themes/[theme]` and the
 * `/parlement/votes/[slug]` detail pages are separate indexable routes and must stay
 * crawlable. The bare `/parlement/votes` and `/parlement/votes?filter=expliques` (the
 * two indexable variants of the listing) carry none of these keys and stay allowed.
 */
const VOTES_FACET_DISALLOW = VOTES_LISTING_FILTER_KEYS.map((key) => `/parlement/votes?*${key}=`);

/**
 * Tab deep-links on politician pages. The tabs are client-side views of one document:
 * the canonical already points at the bare profile, so the extra URLs are crawl cost
 * with no indexable outcome. Seen in the Coverage export under both "crawled, currently
 * not indexed" and "alternate page with proper canonical".
 */
const POLITICIAN_TAB_DISALLOW = ["/politiques/*?*tab=", "/politiques/*/votes?*type="];

/**
 * Note on what is deliberately NOT blocked: the `/affaires/condamnations` facets
 * (?mandat, ?parti, ?certainty, ?view). They look like the same faceted-navigation
 * pattern, but they carry by far the largest share of the site's organic clicks: they are
 * the strongest surface Poligraph has, and unlike the votes facets they are not a
 * zero-click space. Their duplicate-content problem is handled at the metadata layer
 * (buildCanonical in @/lib/seo/condamnations-metadata), never by blocking the crawl.
 */
const INDEXER_DISALLOW = [
  ...SHARED_DISALLOW,
  ...OG_IMAGE_DISALLOW_PATHS,
  ...VOTES_FACET_DISALLOW,
  ...POLITICIAN_TAB_DISALLOW,
];

/**
 * Crawlers whose operator documents `Crawl-delay` (seconds between two requests) as the way to
 * slow them down without blocking them: Parallel for ShapBot, Anthropic for ClaudeBot. ShapBot
 * walked the site in bursts of several thousand pages an hour, each one rendered on demand.
 * The other AI crawlers document no such setting (Amazonbot rejects the directive outright), so
 * nothing is declared for them here.
 */
// Seconds between two requests, per crawler. ClaudeBot used the whole allowance of a ten-second
// delay, day after day (one page every ten seconds, around the clock), so it gets a longer one.
const CRAWL_DELAYS: Record<string, number> = { ShapBot: 10, ClaudeBot: 60 };

export default function robots(): MetadataRoute.Robots {
  if (!isProduction) {
    return { rules: [{ userAgent: "*", disallow: ["/"] }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: INDEXER_DISALLOW,
      },
      // Social preview bots honour robots.txt, and a crawler obeys only the most
      // specific group that names it, so this group has to restate the shared rules
      // it should still follow. It omits OG_IMAGE_DISALLOW_PATHS so link previews keep
      // resolving their og:image, and omits the facet/tab rules because a shared link
      // can legitimately carry those params.
      {
        userAgent: [...SOCIAL_PREVIEW_USER_AGENTS],
        allow: "/",
        disallow: SHARED_DISALLOW,
      },
      // A crawler obeys only the most specific group that names it: each of these restates
      // every rule of the generic group, plus its delay.
      ...Object.entries(CRAWL_DELAYS).map(([userAgent, crawlDelay]) => ({
        userAgent,
        allow: "/",
        disallow: INDEXER_DISALLOW,
        crawlDelay,
      })),
    ],
    sitemap: SITEMAP_SHARD_IDS.map((id) => `${SITE_URL}/sitemap/${id}.xml`),
  };
}
