import { cacheTag, cacheLife } from "next/cache";
import { db } from "@/lib/db";
import { PUBLIC_PARTY_WHERE, PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";

// ── Types ────────────────────────────────────────────────────

interface PressQueryParams {
  page: number;
  limit: number;
  source?: string;
  partyId?: string;
  search?: string;
  sort?: string;
}

// ── Core query (free-text capable, never cached directly) ───

async function queryPress(params: PressQueryParams) {
  const { page, limit, source, partyId, search } = params;
  const skip = (page - 1) * limit;

  const where = {
    OR: [
      { mentions: { some: { politician: PUBLIC_POLITICIAN_WHERE } } },
      { partyMentions: { some: { party: PUBLIC_PARTY_WHERE } } },
    ],
    ...(source && { feedSource: source }),
    ...(partyId && { partyMentions: { some: { partyId, party: PUBLIC_PARTY_WHERE } } }),
    ...(search && {
      title: { contains: search, mode: "insensitive" as const },
    }),
  };

  const [articles, total] = await Promise.all([
    db.pressArticle.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      skip,
      take: limit,
      include: {
        _count: {
          select: {
            mentions: { where: { politician: PUBLIC_POLITICIAN_WHERE } },
          },
        },
        mentions: {
          where: { politician: PUBLIC_POLITICIAN_WHERE },
          include: {
            politician: {
              select: { slug: true, fullName: true },
            },
          },
        },
        partyMentions: {
          where: { party: PUBLIC_PARTY_WHERE },
          include: {
            party: {
              select: { slug: true, name: true, shortName: true, color: true },
            },
          },
        },
      },
    }),
    db.pressArticle.count({ where }),
  ]);

  return { articles, total, totalPages: Math.ceil(total / limit) };
}

// ── Cached path (bounded params) ────────────────────────────

export async function getPressFiltered(params: Omit<PressQueryParams, "search">) {
  "use cache";
  cacheTag("press");
  cacheLife("synced");
  return queryPress(params);
}

// ── Uncached path (free-text search) ────────────────────────

export async function searchPress(params: PressQueryParams) {
  return queryPress(params);
}

// ── Router ──────────────────────────────────────────────────

export async function getPress(params: PressQueryParams) {
  if (params.search) return searchPress(params);
  return getPressFiltered(params);
}

// ── Stats ───────────────────────────────────────────────────

export async function getPressStats() {
  "use cache";
  cacheTag("press");
  cacheLife("synced");

  const linkedFilter = {
    OR: [
      { mentions: { some: { politician: PUBLIC_POLITICIAN_WHERE } } },
      { partyMentions: { some: { party: PUBLIC_PARTY_WHERE } } },
    ],
  };

  const [totalArticles, bySource, totalMentions, totalPartyMentions] = await Promise.all([
    db.pressArticle.count({ where: linkedFilter }),
    db.pressArticle.groupBy({
      by: ["feedSource"],
      where: linkedFilter,
      _count: true,
    }),
    db.pressArticleMention.count({ where: { politician: PUBLIC_POLITICIAN_WHERE } }),
    db.pressArticlePartyMention.count({ where: { party: PUBLIC_PARTY_WHERE } }),
  ]);

  return {
    totalArticles,
    bySource: bySource.reduce(
      (acc, s) => {
        acc[s.feedSource] = s._count;
        return acc;
      },
      {} as Record<string, number>
    ),
    totalMentions,
    totalPartyMentions,
  };
}

// ── Party filter data ───────────────────────────────────────

export async function getPartiesWithPressMentions() {
  "use cache";
  cacheTag("press", "parties");
  cacheLife("synced");

  return db.party.findMany({
    where: { ...PUBLIC_PARTY_WHERE, pressMentions: { some: {} } },
    select: {
      id: true,
      name: true,
      shortName: true,
      color: true,
      _count: { select: { pressMentions: true } },
    },
    orderBy: { pressMentions: { _count: "desc" } },
    take: 20,
  });
}
