/**
 * RSS 2.0 feed builder utilities.
 *
 * Produces spec-compliant RSS 2.0 XML from a channel definition + items array.
 * Used by /api/rss/* route handlers.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RssChannel {
  title: string;
  link: string;
  description: string;
  language?: string;
  /** URL of the feed itself (atom:link rel="self"). Defaults to `link`. */
  feedUrl?: string;
}

export interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate: Date;
  guid: string;
  category?: string;
}

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

/** Escape the 5 XML special characters. */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Build a complete RSS 2.0 XML string. */
export function buildRss(channel: RssChannel, items: RssItem[]): string {
  const itemsXml = items
    .map(
      (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <description>${escapeXml(item.description)}</description>
      <pubDate>${item.pubDate.toUTCString()}</pubDate>
      <guid isPermaLink="true">${escapeXml(item.guid)}</guid>${item.category ? `\n      <category>${escapeXml(item.category)}</category>` : ""}
    </item>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(channel.title)}</title>
    <link>${escapeXml(channel.link)}</link>
    <description>${escapeXml(channel.description)}</description>
    <language>${channel.language ?? "fr"}</language>
    <atom:link href="${escapeXml(channel.feedUrl ?? channel.link)}" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${itemsXml}
  </channel>
</rss>`;
}

/** Wrap an RSS XML string in a Response with correct headers. */
export function createRssResponse(xml: string): Response {
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
