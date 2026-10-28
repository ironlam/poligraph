import { SITE_URL } from "@/config/site";
import { buildRss, type RssItem } from "@/lib/rss";

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

export function buildChangelogRss(
  entries: readonly PublicChangelogEntry[],
  typeLabels: Record<PublicChangelogEntry["type"], string>,
  siteUrl: string = SITE_URL
): string {
  const items: RssItem[] = entries.map((entry) => {
    const link = `${siteUrl}/changelog#${entry.id}`;
    return {
      title: entry.title,
      link,
      guid: link,
      description: entry.sourceUrl ? `${entry.body} Source : ${entry.sourceUrl}` : entry.body,
      pubDate: new Date(`${entry.date}T00:00:00Z`),
      category: typeLabels[entry.type],
    };
  });

  return buildRss(
    {
      title: "Journal des évolutions de Poligraph",
      link: `${siteUrl}/changelog`,
      description: "Les changements apportés à Poligraph, avec leur source.",
    },
    items
  );
}
