import { ImageResponse } from "next/og";
import { OgLayout, OG_SIZE } from "@/lib/og-utils";

/**
 * Shared preview card for the whole presidential hub.
 *
 * Next inherits a route's `opengraph-image` down every descendant segment that does
 * not define its own, so this one file covers the hub, the 13 subject pages and
 * /priorites. That inheritance is the point rather than a side effect: one image URL
 * for the section instead of forty. Search Console attributed the large majority of
 * the site's "crawled, currently not indexed" bucket to `opengraph-image` routes, so
 * every one we do not create is crawl budget we keep.
 *
 * The candidate fiches are the one segment that defines its own, because a fiche is
 * about a person and its shared card has to carry that person's face; see the comment
 * in candidats/[slug]/opengraph-image.tsx.
 *
 * The route is covered without further work by OG_IMAGE_ROBOTS_SOURCE (X-Robots-Tag)
 * and OG_IMAGE_DISALLOW_PATHS (robots.txt), both matching any path ending in
 * `/opengraph-image`.
 *
 * For the same reason there is no `twitter-image` beside it. That filename is a
 * different route family, and neither the header rule nor the robots.txt rule would
 * match it. Twitter falls back to og:image and crops it to 2:1, which is why nothing
 * that has to stay readable sits in the top or bottom 20 pixels.
 *
 * Nothing here is read from the database. A figure baked into an OG image is cached
 * by every platform that ever rendered it, so "25 candidatures" would still be shown
 * long after it stopped being true, with no way to correct it. It also spares a full
 * render plus a query on each crawl.
 */

export const alt =
  "Poligraph, présidentielle 2027 : pour chaque thème, les propositions des candidats, leurs votes et leurs bilans.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <OgLayout>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          justifyContent: "center",
          gap: 28,
        }}
      >
        <span
          style={{
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: "#7dd3fc",
          }}
        >
          Présidentielle 2027
        </span>

        {/* The hub's own H1. Sized for a 500px-wide card in a feed, which is the
              only place this image is ever seen. */}
        <span
          style={{
            fontSize: 92,
            fontWeight: 800,
            lineHeight: 1.02,
            letterSpacing: -2,
            color: "white",
            maxWidth: 1000,
          }}
        >
          Qu&apos;est-ce qui changerait pour vous&nbsp;?
        </span>

        <span style={{ fontSize: 32, lineHeight: 1.3, color: "#cbd5e1", maxWidth: 900 }}>
          Pour chaque thème : les propositions, les votes, les bilans.
        </span>
      </div>
    </OgLayout>,
    { ...OG_SIZE }
  );
}
