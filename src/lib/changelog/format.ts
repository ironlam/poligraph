import { SITE_URL } from "@/config/site";

export type PublicChangelogEntry = {
  id: string;
  type: "NOUVEAUTE" | "AMELIORATION" | "CORRECTION" | "DONNEES";
  /** Calendar day, `AAAA-MM-JJ`. */
  date: string;
  title: string;
  body: string;
  sourceUrl: string | null;
};

const DAY_FORMAT = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** `2026-10-24` -> `24 octobre 2026`. The day is a calendar date: read it in UTC, never locally. */
export function formatChangelogDay(isoDay: string): string {
  return DAY_FORMAT.format(new Date(`${isoDay}T00:00:00Z`));
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildChangelogRss(
  entries: readonly PublicChangelogEntry[],
  typeLabels: Record<PublicChangelogEntry["type"], string>,
  siteUrl: string = SITE_URL
): string {
  const items = entries
    .map((entry) => {
      const link = `${siteUrl}/changelog#${entry.id}`;
      const description = entry.sourceUrl
        ? `${entry.body} Source : ${entry.sourceUrl}`
        : entry.body;
      return [
        "    <item>",
        `      <title>${escapeXml(entry.title)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        `      <pubDate>${new Date(`${entry.date}T00:00:00Z`).toUTCString()}</pubDate>`,
        `      <category>${escapeXml(typeLabels[entry.type])}</category>`,
        `      <description>${escapeXml(description)}</description>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "  <channel>",
    "    <title>Journal des évolutions de Poligraph</title>",
    `    <link>${escapeXml(`${siteUrl}/changelog`)}</link>`,
    "    <description>Les changements apportés à Poligraph, avec leur source.</description>",
    "    <language>fr</language>",
    items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}
