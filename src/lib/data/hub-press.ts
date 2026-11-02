import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { Prisma } from "@/generated/prisma";
import { HUB_PRESS_FEED_IDS, HUB_PRESS_FEEDS, type HubPressFeedId } from "@/config/press-sources";
import { db } from "@/lib/db";
import { PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";
import { keepArticlesCitingNewCandidates } from "@/lib/presidentielle/press-diversity";
import { observeRead } from "@/lib/telemetry/read-operations";
import { PUBLIC_TRACKED_PRESIDENTIAL_CANDIDACY_WHERE } from "./presidential-candidacy-policy";

/** Articles shown on the hub. */
export const HUB_PRESS_LIMIT = 3;
/** Rows read before `keepArticlesCitingNewCandidates`. Bounded: one indexed `take`. */
const HUB_PRESS_SCAN = 30;
/** Older coverage is not "en ce moment". */
const HUB_PRESS_WINDOW_DAYS = 30;

export type HubPressArticle = {
  id: string;
  title: string;
  url: string;
  outlet: string;
  publishedAt: Date;
  candidates: Array<{ name: string; slug: string }>;
};

/**
 * A running candidacy of this election, as the press block recognises its politician. Withdrawn
 * candidacies stay out: coverage of a former candidate is not campaign news.
 */
function runningCandidacyWhere(electionId: string): Prisma.CandidacyWhereInput {
  return {
    ...PUBLIC_TRACKED_PRESIDENTIAL_CANDIDACY_WHERE,
    electionId,
    status: { in: ["OFFICIAL", "DECLARE", "PRESSENTI", "ENVISAGE"] },
  };
}

async function queryHubPress(electionId: string, now: Date): Promise<HubPressArticle[]> {
  const candidatePolitician: Prisma.PoliticianWhereInput = {
    ...PUBLIC_POLITICIAN_WHERE,
    candidacies: { some: runningCandidacyWhere(electionId) },
  };
  const since = new Date(now.getTime() - HUB_PRESS_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const rows = await db.pressArticle.findMany({
    where: {
      feedSource: { in: HUB_PRESS_FEED_IDS },
      publishedAt: { gte: since },
      // Analysed and found unrelated to a judicial affair. Not-yet-analysed articles wait: judicial
      // coverage of a named person goes through the affair pipeline and its guards, never here.
      isAffairRelated: false,
      mentions: { some: { politician: candidatePolitician } },
    },
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
    take: HUB_PRESS_SCAN,
    select: {
      id: true,
      title: true,
      url: true,
      feedSource: true,
      publishedAt: true,
      mentions: {
        where: { politician: candidatePolitician },
        select: { politician: { select: { id: true, fullName: true, slug: true } } },
        orderBy: { politician: { fullName: "asc" } },
      },
    },
  });

  const articles = rows.map((row) => ({
    id: row.id,
    title: row.title,
    url: row.url,
    outlet: HUB_PRESS_FEEDS[row.feedSource as HubPressFeedId],
    publishedAt: row.publishedAt,
    candidateIds: row.mentions.map((mention) => mention.politician.id),
    candidates: row.mentions.map((mention) => ({
      name: mention.politician.fullName,
      slug: mention.politician.slug,
    })),
  }));

  return keepArticlesCitingNewCandidates(articles, HUB_PRESS_LIMIT).map(
    ({ candidateIds: _ids, ...article }) => article
  );
}

/** Plain async, integration-testable. Pages call `getHubPress`, which caches this. */
export async function loadHubPress(electionId: string, now: Date = new Date()) {
  return observeRead("presidential.hub.press", () => queryHubPress(electionId, now));
}

export async function getHubPress(electionSlug: string): Promise<HubPressArticle[]> {
  const election = await db.election.findUnique({
    where: { slug: electionSlug },
    select: { id: true },
  });
  if (election === null) return [];
  return getHubPressCached(election.id);
}

/**
 * `politicians` is the tag both refresh paths already bust: the daily sync after press ingestion
 * and analysis, and the admin unlink of a wrong mention (`/api/admin/presse/mentions/[id]`), so a
 * moderated link leaves the hub on the next request.
 */
async function getHubPressCached(electionId: string): Promise<HubPressArticle[]> {
  "use cache";
  cacheTag("press", "politicians", `election-candidacies:${electionId}`);
  cacheLife("synced");
  return loadHubPress(electionId);
}
