import { cacheTag, cacheLife } from "next/cache";
import { db } from "@/lib/db";
import { Prisma, type PlatformUpdateType } from "@/generated/prisma";
import { getCertaintyLevel } from "@/config/certainty";
import {
  getPublicFactCheckSqlWhere,
  getPublicFactCheckWhere,
  PUBLIC_PARTY_WHERE,
  PUBLIC_POLITICIAN_PUBLICATION_STATUS,
  PUBLIC_POLITICIAN_WHERE,
} from "@/lib/api/public-contract";
import { getPublishedAffairSqlWhere, getPublishedAffairWhere } from "@/lib/affairs/public-filters";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TopPolitician {
  slug: string;
  fullName: string;
  photoUrl: string | null;
  partyShortName: string | null;
  partyColor: string | null;
  count: number;
}

export interface PressStoryMentions {
  politicians: Array<{ slug: string; fullName: string; party: string | null; isActive: boolean }>;
  parties: Array<{ slug: string; shortName: string }>;
  affairs: Array<{ slug: string; title: string; certaintyLevel: string }>;
}

export interface PressStoryCandidate {
  articleId: string;
  title: string;
  feedSource: string;
  url: string;
  imageUrl: string | null;
  publishedAt: Date;
  aiSummary: string | null;
  isAffairRelated: boolean;
  mentions: PressStoryMentions;
}

export interface PressStory {
  articleId: string;
  title: string;
  feedSource: string;
  url: string;
  imageUrl: string | null;
  publishedAt: Date;
  aiSummary: string | null;
  isAffairRelated: boolean;
  mentions: {
    politicians: Array<{ slug: string; fullName: string; party: string | null }>;
    parties: Array<{ slug: string; shortName: string }>;
    affairs: Array<{ slug: string; title: string; certaintyLevel: string }>;
  };
}

export interface PoliticianStory {
  slug: string;
  fullName: string;
  photoUrl: string | null;
  partyShortName: string | null;
  articleCount: number;
  topArticles: Array<Pick<PressStory, "articleId" | "title" | "feedSource" | "url">>;
}

export interface AffairStory {
  slug: string;
  title: string;
  certaintyLevel: string;
  politicianSlug: string;
  politicianName: string;
  articleCount: number;
}

interface WeeklyScrutin {
  slug: string | null;
  title: string;
  chamber: string;
  result: string;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  votingDate: Date;
}

interface WeeklyAffair {
  slug: string;
  title: string;
  certaintyLevel: string;
  politicianName: string;
  politicianSlug: string;
}

interface PlatformUpdateItem {
  id: string;
  title: string;
  type: PlatformUpdateType;
  date: Date;
  sourceUrl: string | null;
}

export interface WeeklyRecapData {
  weekStart: Date;
  weekEnd: Date;
  votes: {
    scrutins: WeeklyScrutin[];
    adopted: number;
    rejected: number;
    total: number;
  };
  activity: {
    topVoters: TopPolitician[];
  };
  affairs: {
    newAffairs: WeeklyAffair[];
    total: number;
  };
  factChecks: {
    total: number;
    trueCount: number;
    falseCount: number;
    mixedCount: number;
    topPoliticians: TopPolitician[];
  };
  press: {
    articleCount: number;
    topPoliticians: TopPolitician[]; // deprecated, kept until Phase 5 removes it
    storiesOfTheWeek: PressStory[]; // 10 max for /recap web, slice to 3 for newsletter
    byPolitician: PoliticianStory[]; // top mentioned politicians this week with their top articles
    byAffair: AffairStory[]; // articles linked to ongoing affairs
  };
  platformUpdates: {
    updates: PlatformUpdateItem[];
    total: number;
  };
}

// ---------------------------------------------------------------------------
// Week utilities
// ---------------------------------------------------------------------------

/** Get Monday 00:00 UTC of the week containing the given date */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = 1
  d.setUTCDate(d.getUTCDate() + diff);
  return new Date(d.toISOString().split("T")[0] + "T00:00:00Z");
}

/** Get Sunday 23:59:59 UTC (end = next Monday 00:00) */
export function getWeekEnd(weekStart: Date): Date {
  const end = new Date(weekStart);
  end.setUTCDate(end.getUTCDate() + 7);
  return end;
}

/** ISO week number */
export function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Format a date as the ISO week string of its containing week (e.g. "2026-W18"). */
export function getISOWeekString(date: Date): string {
  // ISO week year: the Thursday of the same week determines the year.
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const year = thursday.getUTCFullYear();
  const weekNum = getISOWeekNumber(date);
  return `${year}-W${String(weekNum).padStart(2, "0")}`;
}

/** Parse an ISO week string ("YYYY-Www") to its Monday at 00:00 UTC, or null if invalid. */
export function parseISOWeekString(s: string): Date | null {
  const m = s.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > 53) return null;
  // ISO week 1 contains the Thursday of week 1; jan 4 always falls in week 1.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // Sunday=0 → 7
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1) + (week - 1) * 7);
  return monday;
}

// ---------------------------------------------------------------------------
// Press story selection
// ---------------------------------------------------------------------------

export function scorePressStory(
  article: PressStoryCandidate,
  alreadyChosenPoliticianSlugs: string[],
  alreadyChosenSources: string[]
): number {
  let score = 0;
  const activePoliticians = article.mentions.politicians.filter((p) => p.isActive);
  if (activePoliticians.length >= 1) score += 3;
  if (activePoliticians.length >= 2) {
    score += Math.min(activePoliticians.length - 1, 4) * 2;
  }
  if (article.isAffairRelated || article.mentions.affairs.length > 0) score += 5;
  if (!alreadyChosenSources.includes(article.feedSource)) score += 2;

  const repeatedPenalty =
    activePoliticians.filter((p) => alreadyChosenPoliticianSlugs.includes(p.slug)).length * -3;
  score += repeatedPenalty;

  if (!article.aiSummary) score -= 5;
  return score;
}

export async function selectPressStories(
  weekStart: Date,
  weekEnd: Date,
  limit: number
): Promise<PressStory[]> {
  const articles = await db.pressArticle.findMany({
    where: { publishedAt: { gte: weekStart, lt: weekEnd } },
    include: {
      mentions: {
        // Only surface mentions of PUBLISHED politicians. DRAFT, ARCHIVED,
        // EXCLUDED or REJECTED profiles must never leak via press grids.
        where: { politician: PUBLIC_POLITICIAN_WHERE },
        include: {
          politician: {
            select: {
              slug: true,
              fullName: true,
              currentParty: { select: { shortName: true } },
              mandates: { where: { isCurrent: true }, take: 1, select: { id: true } },
            },
          },
        },
      },
      partyMentions: {
        where: { party: PUBLIC_PARTY_WHERE },
        include: { party: { select: { slug: true, shortName: true } } },
      },
      affairLinks: {
        // Only surface PUBLISHED affairs to the public Recap grid. Drafts ("À
        // vérifier") and rejected affairs must never leak via press story
        // mentions, even when an article correctly references them.
        where: {
          affair: {
            ...getPublishedAffairWhere(),
            politician: PUBLIC_POLITICIAN_WHERE,
          },
        },
        include: { affair: { select: { slug: true, title: true, status: true } } },
      },
    },
  });

  const candidates: PressStoryCandidate[] = articles.map((a) => ({
    articleId: a.id,
    title: a.title,
    feedSource: a.feedSource,
    url: a.url,
    imageUrl: a.imageUrl,
    publishedAt: a.publishedAt,
    aiSummary: a.aiSummary,
    isAffairRelated: a.isAffairRelated ?? false,
    mentions: {
      politicians: a.mentions.map((m) => ({
        slug: m.politician.slug,
        fullName: m.politician.fullName,
        party: m.politician.currentParty?.shortName ?? null,
        isActive: m.politician.mandates.length > 0,
      })),
      parties: a.partyMentions
        .filter((pm) => pm.party.slug !== null)
        .map((pm) => ({
          slug: pm.party.slug as string,
          shortName: pm.party.shortName,
        })),
      affairs: a.affairLinks.map((al) => ({
        slug: al.affair.slug,
        title: al.affair.title,
        certaintyLevel: getCertaintyLevel(al.affair.status),
      })),
    },
  }));

  const chosen: PressStory[] = [];
  const usedSlugs: string[] = [];
  const usedSources: string[] = [];

  while (chosen.length < limit) {
    const remaining = candidates.filter((c) => !chosen.some((s) => s.articleId === c.articleId));
    if (remaining.length === 0) break;
    const scored = remaining.map((c) => ({
      c,
      score: scorePressStory(c, usedSlugs, usedSources),
    }));
    scored.sort((a, b) => b.score - a.score);
    const top = scored[0];
    if (!top || top.score < 0) break;

    chosen.push({
      articleId: top.c.articleId,
      title: top.c.title,
      feedSource: top.c.feedSource,
      url: top.c.url,
      imageUrl: top.c.imageUrl,
      publishedAt: top.c.publishedAt,
      aiSummary: top.c.aiSummary,
      isAffairRelated: top.c.isAffairRelated,
      mentions: {
        politicians: top.c.mentions.politicians.map(({ slug, fullName, party }) => ({
          slug,
          fullName,
          party,
        })),
        parties: top.c.mentions.parties,
        affairs: top.c.mentions.affairs,
      },
    });
    for (const p of top.c.mentions.politicians) {
      if (!usedSlugs.includes(p.slug)) usedSlugs.push(p.slug);
    }
    if (!usedSources.includes(top.c.feedSource)) usedSources.push(top.c.feedSource);
  }

  return chosen;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

async function queryWeeklyRecap(weekStart: Date, weekEnd: Date): Promise<WeeklyRecapData> {
  const [scrutins, topVoters, affairs, factCheckData, pressData, platformUpdates] =
    await Promise.all([
      // 1. Weekly scrutins
      db.scrutin.findMany({
        where: { votingDate: { gte: weekStart, lt: weekEnd } },
        select: {
          slug: true,
          title: true,
          chamber: true,
          result: true,
          votesFor: true,
          votesAgainst: true,
          votesAbstain: true,
          votingDate: true,
        },
        orderBy: { votingDate: "desc" },
      }),

      // 2. Most active voters this week
      db.$queryRaw<
        Array<{
          slug: string;
          fullName: string;
          photoUrl: string | null;
          partyShortName: string | null;
          partyColor: string | null;
          count: bigint;
        }>
      >`
      SELECT
        p.slug,
        p."fullName" as "fullName",
        p."photoUrl" as "photoUrl",
        par."shortName" as "partyShortName",
        par.color as "partyColor",
        COUNT(v.id) as count
      FROM "Vote" v
      JOIN "Politician" p ON v."politicianId" = p.id
      LEFT JOIN "Party" par ON p."currentPartyId" = par.id
      JOIN "Scrutin" s ON v."scrutinId" = s.id
      WHERE s."votingDate" >= ${weekStart}
        AND s."votingDate" < ${weekEnd}
        AND p."publicationStatus" = ${PUBLIC_POLITICIAN_PUBLICATION_STATUS}
        AND v.position IN ('POUR', 'CONTRE', 'ABSTENTION')
      GROUP BY p.id, p.slug, p."fullName", p."photoUrl", par."shortName", par.color
      ORDER BY count DESC
      LIMIT 5
    `,

      // 3. New affairs this week — use revelation/facts date, not import date
      db.$queryRaw<
        Array<{
          slug: string;
          title: string;
          certaintyLevel: string;
          politicianName: string;
          politicianSlug: string;
        }>
      >(Prisma.sql`
      SELECT
        a.slug,
        a.title,
        CASE a.status
          WHEN 'CONDAMNATION_DEFINITIVE' THEN 'ETABLI'
          WHEN 'CONDAMNATION_PREMIERE_INSTANCE' THEN 'PRONONCE'
          WHEN 'APPEL_EN_COURS' THEN 'PRONONCE'
          WHEN 'POURVOI_EN_CASSATION' THEN 'PRONONCE'
          WHEN 'MISE_EN_EXAMEN' THEN 'EN_COURS'
          WHEN 'RENVOI_TRIBUNAL' THEN 'EN_COURS'
          WHEN 'PROCES_EN_COURS' THEN 'EN_COURS'
          WHEN 'ENQUETE_PRELIMINAIRE' THEN 'EN_COURS'
          WHEN 'INSTRUCTION' THEN 'EN_COURS'
          WHEN 'INSTRUCTION_CLOTUREE_SANS_MISE_EN_EXAMEN' THEN 'CLOS_SANS_CHARGE'
          ELSE 'CLOS_FAVORABLE'
        END as "certaintyLevel",
        p."fullName" as "politicianName",
        p.slug as "politicianSlug"
      FROM "Affair" a
      JOIN "Politician" p ON a."politicianId" = p.id
      WHERE ${getPublishedAffairSqlWhere()}
        AND p."publicationStatus" = ${PUBLIC_POLITICIAN_PUBLICATION_STATUS}
        AND a.involvement NOT IN ('VICTIM', 'PLAINTIFF', 'MENTIONED_ONLY')
        AND COALESCE(a."startDate", a."factsDate", a."createdAt") >= ${weekStart}
        AND COALESCE(a."startDate", a."factsDate", a."createdAt") < ${weekEnd}
      ORDER BY CASE a.status
        WHEN 'CONDAMNATION_DEFINITIVE' THEN 0
        WHEN 'CONDAMNATION_PREMIERE_INSTANCE' THEN 1
        WHEN 'APPEL_EN_COURS' THEN 1
        WHEN 'POURVOI_EN_CASSATION' THEN 1
        WHEN 'MISE_EN_EXAMEN' THEN 2
        WHEN 'RENVOI_TRIBUNAL' THEN 2
        WHEN 'PROCES_EN_COURS' THEN 2
        WHEN 'ENQUETE_PRELIMINAIRE' THEN 2
        WHEN 'INSTRUCTION' THEN 2
        WHEN 'INSTRUCTION_CLOTUREE_SANS_MISE_EN_EXAMEN' THEN 3
        ELSE 4
      END ASC
      LIMIT 10
    `),

      // 4. Fact-checks this week
      Promise.all([
        db.factCheck.groupBy({
          by: ["verdictRating"],
          where: {
            ...getPublicFactCheckWhere(),
            createdAt: { gte: weekStart, lt: weekEnd },
          },
          _count: true,
        }),
        db.$queryRaw<
          Array<{
            slug: string;
            fullName: string;
            photoUrl: string | null;
            partyShortName: string | null;
            partyColor: string | null;
            count: bigint;
          }>
        >(Prisma.sql`
        SELECT
          p.slug,
          p."fullName" as "fullName",
          p."photoUrl" as "photoUrl",
          par."shortName" as "partyShortName",
          par.color as "partyColor",
          COUNT(m.id) as count
        FROM "FactCheckMention" m
        JOIN "FactCheck" fc ON m."factCheckId" = fc.id
        JOIN "Politician" p ON m."politicianId" = p.id
        LEFT JOIN "Party" par ON p."currentPartyId" = par.id
        WHERE fc."createdAt" >= ${weekStart}
          AND fc."createdAt" < ${weekEnd}
          AND ${getPublicFactCheckSqlWhere()}
          AND p."publicationStatus" = ${PUBLIC_POLITICIAN_PUBLICATION_STATUS}
          AND m."isClaimant" = true
        GROUP BY p.id, p.slug, p."fullName", p."photoUrl", par."shortName", par.color
        ORDER BY count DESC
        LIMIT 5
      `),
      ]),

      // 5. Press mentions this week (only articles with at least one mention)
      Promise.all([
        db.pressArticle.count({
          where: {
            publishedAt: { gte: weekStart, lt: weekEnd },
            OR: [
              { mentions: { some: { politician: PUBLIC_POLITICIAN_WHERE } } },
              { partyMentions: { some: { party: PUBLIC_PARTY_WHERE } } },
            ],
          },
        }),
        db.$queryRaw<
          Array<{
            slug: string;
            fullName: string;
            photoUrl: string | null;
            partyShortName: string | null;
            partyColor: string | null;
            count: bigint;
          }>
        >`
        SELECT
          p.slug,
          p."fullName" as "fullName",
          p."photoUrl" as "photoUrl",
          par."shortName" as "partyShortName",
          par.color as "partyColor",
          COUNT(m."articleId") as count
        FROM "PressArticleMention" m
        JOIN "PressArticle" a ON m."articleId" = a.id
        JOIN "Politician" p ON m."politicianId" = p.id
        LEFT JOIN "Party" par ON p."currentPartyId" = par.id
        WHERE a."publishedAt" >= ${weekStart}
          AND a."publishedAt" < ${weekEnd}
          AND p."publicationStatus" = ${PUBLIC_POLITICIAN_PUBLICATION_STATUS}
        GROUP BY p.id, p.slug, p."fullName", p."photoUrl", par."shortName", par.color
        ORDER BY count DESC
        LIMIT 5
      `,
      ]),

      // 6. Platform updates this week
      db.platformUpdate.findMany({
        where: { date: { gte: weekStart, lt: weekEnd } },
        orderBy: { date: "desc" },
        select: { id: true, title: true, type: true, date: true, sourceUrl: true },
        take: 5,
      }),
    ]);

  // Process fact-check verdicts
  const [verdictGroups, fcTopPoliticians] = factCheckData;
  let trueCount = 0;
  let falseCount = 0;
  let mixedCount = 0;
  let fcTotal = 0;
  for (const g of verdictGroups) {
    fcTotal += g._count;
    if (g.verdictRating === "TRUE" || g.verdictRating === "MOSTLY_TRUE") {
      trueCount += g._count;
    } else if (g.verdictRating === "FALSE" || g.verdictRating === "MOSTLY_FALSE") {
      falseCount += g._count;
    } else {
      mixedCount += g._count;
    }
  }

  const [articleCount, pressTopPoliticians] = pressData;

  // Compute press stories (full ranked list) and aggregations for /recap web view
  const storiesOfTheWeek = await selectPressStories(weekStart, weekEnd, 10);

  // byPolitician: aggregate politicians referenced in stories with their top articles
  const politicianAggregates = new Map<
    string,
    {
      slug: string;
      fullName: string;
      partyShortName: string | null;
      articleCount: number;
      topArticles: Array<Pick<PressStory, "articleId" | "title" | "feedSource" | "url">>;
    }
  >();

  for (const story of storiesOfTheWeek) {
    for (const p of story.mentions.politicians) {
      const existing = politicianAggregates.get(p.slug);
      if (existing) {
        existing.articleCount += 1;
        if (existing.topArticles.length < 3) {
          existing.topArticles.push({
            articleId: story.articleId,
            title: story.title,
            feedSource: story.feedSource,
            url: story.url,
          });
        }
      } else {
        politicianAggregates.set(p.slug, {
          slug: p.slug,
          fullName: p.fullName,
          partyShortName: p.party,
          articleCount: 1,
          topArticles: [
            {
              articleId: story.articleId,
              title: story.title,
              feedSource: story.feedSource,
              url: story.url,
            },
          ],
        });
      }
    }
  }

  // Fetch photoUrl for politicians referenced in stories
  const politicianSlugs = Array.from(politicianAggregates.keys());
  const photoMap = new Map<string, string | null>();
  if (politicianSlugs.length > 0) {
    const politicians = await db.politician.findMany({
      where: { slug: { in: politicianSlugs }, ...PUBLIC_POLITICIAN_WHERE },
      select: { slug: true, photoUrl: true },
    });
    for (const p of politicians) photoMap.set(p.slug, p.photoUrl);
  }

  const byPolitician: PoliticianStory[] = Array.from(politicianAggregates.values())
    .map((p) => ({
      slug: p.slug,
      fullName: p.fullName,
      photoUrl: photoMap.get(p.slug) ?? null,
      partyShortName: p.partyShortName,
      articleCount: p.articleCount,
      topArticles: p.topArticles,
    }))
    .sort((a, b) => b.articleCount - a.articleCount);

  // byAffair: aggregate affairs referenced in stories
  const affairAggregates = new Map<
    string,
    {
      slug: string;
      title: string;
      certaintyLevel: string;
      politicianSlug: string;
      politicianName: string;
      articleCount: number;
    }
  >();

  for (const story of storiesOfTheWeek) {
    for (const af of story.mentions.affairs) {
      const existing = affairAggregates.get(af.slug);
      if (existing) {
        existing.articleCount += 1;
      } else {
        // Most prominent politician = first politician mentioned in this story
        const firstPolitician = story.mentions.politicians[0];
        affairAggregates.set(af.slug, {
          slug: af.slug,
          title: af.title,
          certaintyLevel: af.certaintyLevel,
          politicianSlug: firstPolitician?.slug ?? "",
          politicianName: firstPolitician?.fullName ?? "",
          articleCount: 1,
        });
      }
    }
  }

  // Fill missing politicianSlug/Name from Affair table (for affairs without a politician mention in the same article)
  const affairsMissingPolitician = Array.from(affairAggregates.values()).filter(
    (a) => !a.politicianSlug
  );
  if (affairsMissingPolitician.length > 0) {
    const affairData = await db.affair.findMany({
      where: {
        slug: { in: affairsMissingPolitician.map((a) => a.slug) },
        ...getPublishedAffairWhere(),
        politician: PUBLIC_POLITICIAN_WHERE,
      },
      select: {
        slug: true,
        politician: { select: { slug: true, fullName: true } },
      },
    });
    for (const a of affairData) {
      const agg = affairAggregates.get(a.slug);
      if (agg) {
        agg.politicianSlug = a.politician.slug;
        agg.politicianName = a.politician.fullName;
      }
    }
  }

  const byAffair: AffairStory[] = Array.from(affairAggregates.values()).sort(
    (a, b) => b.articleCount - a.articleCount
  );

  const toBigintSafe = (
    rows: Array<{
      slug: string;
      fullName: string;
      photoUrl: string | null;
      partyShortName: string | null;
      partyColor: string | null;
      count: bigint;
    }>
  ): TopPolitician[] => rows.map((r) => ({ ...r, count: Number(r.count) }));

  return {
    weekStart,
    weekEnd,
    votes: {
      scrutins,
      adopted: scrutins.filter((s) => s.result === "ADOPTED").length,
      rejected: scrutins.filter((s) => s.result === "REJECTED").length,
      total: scrutins.length,
    },
    activity: {
      topVoters: toBigintSafe(topVoters),
    },
    affairs: {
      newAffairs: affairs,
      total: affairs.length,
    },
    factChecks: {
      total: fcTotal,
      trueCount,
      falseCount,
      mixedCount,
      topPoliticians: toBigintSafe(fcTopPoliticians),
    },
    press: {
      articleCount,
      topPoliticians: toBigintSafe(pressTopPoliticians),
      storiesOfTheWeek,
      byPolitician,
      byAffair,
    },
    platformUpdates: {
      updates: platformUpdates,
      total: platformUpdates.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Cached public API
// ---------------------------------------------------------------------------

export async function getWeeklyRecap(weekStart: Date): Promise<WeeklyRecapData> {
  "use cache";
  cacheTag("weekly-recap", "votes", "affairs", "politicians");
  cacheLife("synced");

  const weekEnd = getWeekEnd(weekStart);
  return queryWeeklyRecap(weekStart, weekEnd);
}
