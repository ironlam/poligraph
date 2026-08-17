import { db } from "@/lib/db";
import { buildRss, createRssResponse } from "@/lib/rss";
import { SITE_URL } from "@/config/site";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { getPublicFactCheckWhere } from "@/lib/api/public-contract";

export const revalidate = 300;

export const GET = withPublicRoute(async () => {
  const factchecks = await db.factCheck.findMany({
    where: getPublicFactCheckWhere(),
    orderBy: { publishedAt: "desc" },
    take: 50,
    select: {
      slug: true,
      title: true,
      verdict: true,
      source: true,
      publishedAt: true,
    },
  });

  const items = factchecks
    .filter((f) => f.slug)
    .map((f) => ({
      title: f.title,
      link: `${SITE_URL}/factchecks/${f.slug}`,
      description: `Verdict : ${f.verdict} — Source : ${f.source}`,
      pubDate: f.publishedAt,
      guid: `${SITE_URL}/factchecks/${f.slug}`,
      category: f.source,
    }));

  const xml = buildRss(
    {
      title: "Poligraph — Fact-checking",
      link: `${SITE_URL}/api/rss/factchecks.xml`,
      description: "Les 50 derniers fact-checks référencés sur Poligraph.",
    },
    items
  );

  return createRssResponse(xml);
});
