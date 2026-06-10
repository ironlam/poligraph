import { db } from "@/lib/db";
import { buildRss, createRssResponse } from "@/lib/rss";
import { VOTING_RESULT_LABELS, CHAMBER_LABELS } from "@/config/labels";
import type { VotingResult, Chamber } from "@/types";
import { SITE_URL } from "@/config/site";
import { withPublicRoute } from "@/lib/api/with-public-route";

export const revalidate = 300;

export const GET = withPublicRoute(async () => {
  const scrutins = await db.scrutin.findMany({
    orderBy: { votingDate: "desc" },
    take: 50,
    select: {
      slug: true,
      title: true,
      description: true,
      votingDate: true,
      result: true,
      chamber: true,
    },
  });

  const items = scrutins
    .filter((s) => s.slug)
    .map((s) => {
      const resultLabel = VOTING_RESULT_LABELS[s.result as VotingResult] ?? s.result;
      const desc = s.description?.slice(0, 500) ?? "";

      return {
        title: s.title,
        link: `${SITE_URL}/parlement/votes/${s.slug}`,
        description: `${resultLabel} — ${desc}`,
        pubDate: s.votingDate,
        guid: `${SITE_URL}/parlement/votes/${s.slug}`,
        category: CHAMBER_LABELS[s.chamber as Chamber],
      };
    });

  const xml = buildRss(
    {
      title: "Poligraph — Votes & scrutins",
      link: `${SITE_URL}/api/rss/votes.xml`,
      description: "Les 50 derniers scrutins parlementaires référencés sur Poligraph.",
    },
    items
  );

  return createRssResponse(xml);
});
