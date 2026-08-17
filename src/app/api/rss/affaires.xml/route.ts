import { db } from "@/lib/db";
import { buildRss, createRssResponse } from "@/lib/rss";
import { AFFAIR_CATEGORY_LABELS } from "@/config/labels";
import type { AffairCategory } from "@/types";
import { SITE_URL } from "@/config/site";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";
import { getPublishedAffairWhere } from "@/lib/affairs/public-filters";

export const revalidate = 300;

export const GET = withPublicRoute(async () => {
  const affairs = await db.affair.findMany({
    where: {
      ...getPublishedAffairWhere(),
      politician: PUBLIC_POLITICIAN_WHERE,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      slug: true,
      title: true,
      description: true,
      createdAt: true,
      category: true,
      politician: { select: { fullName: true } },
    },
  });

  const items = affairs.map((a) => ({
    title: `${a.title} — ${a.politician.fullName}`,
    link: `${SITE_URL}/affaires/${a.slug}`,
    description: a.description.slice(0, 500),
    pubDate: a.createdAt,
    guid: `${SITE_URL}/affaires/${a.slug}`,
    category: AFFAIR_CATEGORY_LABELS[a.category as AffairCategory],
  }));

  const xml = buildRss(
    {
      title: "Poligraph — Affaires judiciaires",
      link: `${SITE_URL}/api/rss/affaires.xml`,
      description: "Les 50 dernières affaires judiciaires publiées sur Poligraph.",
    },
    items
  );

  return createRssResponse(xml);
});
