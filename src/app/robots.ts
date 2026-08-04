import { MetadataRoute } from "next";
import { SITE_URL } from "@/config/site";
import { OG_IMAGE_DISALLOW_PATHS, SOCIAL_PREVIEW_USER_AGENTS } from "@/lib/seo/og-image-robots";
import { VOTES_LISTING_FILTER_KEYS } from "@/lib/seo/listing-filters";

const isProduction =
  process.env.VERCEL_ENV === "production" ||
  (!process.env.VERCEL_ENV && SITE_URL.includes("poligraph.fr") && !SITE_URL.includes("staging"));

/**
 * Crawl-blocked paths that every user agent gets, social preview bots included.
 *
 * These are the rules where blocking the fetch is the point (private surfaces, dead
 * archives, duplicate pagination) — as opposed to OG_IMAGE_DISALLOW_PATHS below, which
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
];

/**
 * The /parlement/votes facet space, one `Disallow` per filter key.
 *
 * Every one of these URLs already emits noindex,follow (see listingRobotsMetadata in
 * the page) and every one of them canonicalises to a filter-free sibling — yet the
 * 2026-08-04 Coverage export still counts 2,456 of them under "alternate page with
 * proper canonical", because noindex and rel=canonical both cost a crawl before they
 * can say anything. The filters combine (chamber x legislature x result x theme x type),
 * so the crawlable surface grows multiplicatively while the whole facet space earns zero
 * clicks. Blocking the fetch is what actually returns the budget to real pages.
 *
 * Scoped to the `?` boundary on purpose: `/parlement/votes/themes/[theme]` and the
 * `/parlement/votes/[slug]` detail pages are separate indexable routes and must stay
 * crawlable. The bare `/parlement/votes` and `/parlement/votes?filter=expliques` — the
 * two indexable variants of the listing — carry none of these keys and stay allowed.
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
 * pattern, but Search Console attributes ~9,000 of the site's ~23,000 clicks to them —
 * they are the strongest organic surface Poligraph has. Their duplicate-content problem
 * is handled at the metadata layer (buildCanonical in @/lib/seo/condamnations-metadata),
 * never by blocking the crawl.
 */
const INDEXER_DISALLOW = [
  ...SHARED_DISALLOW,
  ...OG_IMAGE_DISALLOW_PATHS,
  ...VOTES_FACET_DISALLOW,
  ...POLITICIAN_TAB_DISALLOW,
];

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
      // specific group that names it — so this group has to restate the shared rules
      // it should still follow. It omits OG_IMAGE_DISALLOW_PATHS so link previews keep
      // resolving their og:image, and omits the facet/tab rules because a shared link
      // can legitimately carry those params.
      {
        userAgent: [...SOCIAL_PREVIEW_USER_AGENTS],
        allow: "/",
        disallow: SHARED_DISALLOW,
      },
    ],
    sitemap: [
      `${SITE_URL}/sitemap/0.xml`,
      `${SITE_URL}/sitemap/1.xml`,
      `${SITE_URL}/sitemap/2.xml`,
      `${SITE_URL}/sitemap/3.xml`,
      `${SITE_URL}/sitemap/4.xml`,
    ],
  };
}
