import { cacheTag, cacheLife } from "next/cache";
import { db } from "@/lib/db";
import type { Chamber, VotingResult, ThemeCategory, ScrutinType, Prisma } from "@/generated/prisma";
import {
  Chamber as ChamberEnum,
  VotingResult as VotingResultEnum,
  ThemeCategory as ThemeCategoryEnum,
} from "@/generated/prisma";
import { pickEnumValue } from "@/lib/data/enum-guards";
import {
  KEY_VOTES_WINDOWS_DAYS,
  KEY_VOTES_GRID_COUNT,
  KEY_VOTES_POOL_SIZE,
  KEY_VOTES_MAX_PER_DOSSIER,
  KEY_VOTES_QUERY_LIMIT,
} from "@/config/scrutin-importance";
import type { PolicyForView } from "@/lib/votes/to-public-title-view";
import { scoreExplainedVote, diversify } from "@/lib/votes/explained-scoring";
import { selectKeyVotes } from "@/lib/votes/key-vote-selection";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DailyScrutin {
  id: string;
  externalId: string;
  slug: string | null;
  title: string;
  votingDate: Date;
  legislature: number;
  chamber: Chamber;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  result: VotingResult;
  sourceUrl: string | null;
  theme: ThemeCategory | null;
  type: ScrutinType | null;
  summary: string | null;
  citizenImpact: string | null;
  policyTitle: PolicyForView | null;
}

export interface DailyVotesData {
  scrutins: DailyScrutin[];
  grouped: Record<Chamber, DailyScrutin[]>;
  total: number;
  adopted: number;
  rejected: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get today's date string in Paris timezone (YYYY-MM-DD). */
export function getParisToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
}

/** Parse a YYYY-MM-DD string into a UTC start-of-day Date. */
function parseDateRange(dateStr: string): { start: Date; end: Date } {
  const start = new Date(dateStr + "T00:00:00Z");
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

const DAILY_SELECT = {
  id: true,
  externalId: true,
  slug: true,
  title: true,
  votingDate: true,
  legislature: true,
  chamber: true,
  votesFor: true,
  votesAgainst: true,
  votesAbstain: true,
  result: true,
  sourceUrl: true,
  theme: true,
  type: true,
  summary: true,
  citizenImpact: true,
  // Plan 6: public policy title (shown only when APPROVED + valid, via resolvePublicTitle).
  policyTitle: {
    select: {
      status: true,
      policyTitle: true,
      policySubtitle: true,
      officialSourceUrl: true,
      proceduralLabel: true,
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Data functions
// ---------------------------------------------------------------------------

/**
 * Get all scrutins for a given date, grouped by chamber.
 * Bounded key space (date string only) → safe for "use cache".
 */
export async function getScrutinsByDate(dateStr: string): Promise<DailyVotesData> {
  "use cache";
  cacheTag("votes", "votes-daily");
  cacheLife("synced");

  const { start, end } = parseDateRange(dateStr);

  const scrutins = await db.scrutin.findMany({
    where: { votingDate: { gte: start, lt: end } },
    orderBy: { votingDate: "desc" },
    select: DAILY_SELECT,
  });

  const grouped: Record<Chamber, DailyScrutin[]> = { AN: [], SENAT: [] };
  let adopted = 0;
  let rejected = 0;

  for (const s of scrutins) {
    grouped[s.chamber].push(s);
    if (s.result === "ADOPTED") adopted++;
    else rejected++;
  }

  return { scrutins, grouped, total: scrutins.length, adopted, rejected };
}

/**
 * Find the nearest dates with votes before/after a given date.
 * Used for prev/next navigation.
 */
export async function getAdjacentVoteDates(
  dateStr: string
): Promise<{ prevDate: string | null; nextDate: string | null }> {
  "use cache";
  cacheTag("votes");
  cacheLife("synced");

  const { start, end } = parseDateRange(dateStr);

  const [prev, next] = await Promise.all([
    db.scrutin.findFirst({
      where: { votingDate: { lt: start } },
      orderBy: { votingDate: "desc" },
      select: { votingDate: true },
    }),
    db.scrutin.findFirst({
      where: { votingDate: { gte: end } },
      orderBy: { votingDate: "asc" },
      select: { votingDate: true },
    }),
  ]);

  return {
    prevDate: prev ? prev.votingDate.toISOString().split("T")[0]! : null,
    nextDate: next ? next.votingDate.toISOString().split("T")[0]! : null,
  };
}

/**
 * Get today's vote summary for the homepage widget.
 */
export async function getTodayVotesSummary(): Promise<{
  total: number;
  adopted: number;
  rejected: number;
  date: string;
}> {
  "use cache";
  cacheTag("votes", "homepage");
  cacheLife("synced");

  const dateStr = getParisToday();
  const { start, end } = parseDateRange(dateStr);

  const results = await db.scrutin.groupBy({
    by: ["result"],
    where: { votingDate: { gte: start, lt: end } },
    _count: true,
  });

  const adopted = results.find((r) => r.result === "ADOPTED")?._count ?? 0;
  const rejected = results.find((r) => r.result === "REJECTED")?._count ?? 0;

  return { total: adopted + rejected, adopted, rejected, date: dateStr };
}

// ---------------------------------------------------------------------------
// Votes listing page — sort
// ---------------------------------------------------------------------------

export type ScrutinSort = "recent" | "close" | "turnout";
const SORT_VALUES: ScrutinSort[] = ["recent", "close", "turnout"];

// Whitelist guard: any non-listed value (incl. injection attempts) -> "recent".
export function normalizeSort(raw: string | undefined): ScrutinSort {
  return SORT_VALUES.includes(raw as ScrutinSort) ? (raw as ScrutinSort) : "recent";
}

type SortableRow = {
  id: string;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  votingDate: Date | null;
};

// Pure in-memory sort for computed orders. No raw SQL: the filtered id set is
// fetched via a parameterized Prisma findMany, then ordered here.
export function sortScrutinsInMemory<T extends SortableRow>(rows: T[], sort: ScrutinSort): T[] {
  const byDateDesc = (a: T, b: T) =>
    (b.votingDate?.getTime() ?? 0) - (a.votingDate?.getTime() ?? 0);
  if (sort === "close") {
    return [...rows].sort(
      (a, b) =>
        Math.abs(a.votesFor - a.votesAgainst) - Math.abs(b.votesFor - b.votesAgainst) ||
        byDateDesc(a, b)
    );
  }
  if (sort === "turnout") {
    const t = (r: T) => r.votesFor + r.votesAgainst + r.votesAbstain;
    return [...rows].sort((a, b) => t(b) - t(a) || byDateDesc(a, b));
  }
  return [...rows].sort(byDateDesc);
}

// ---------------------------------------------------------------------------
// Votes listing page — data functions
// ---------------------------------------------------------------------------

const LISTING_SELECT = {
  ...DAILY_SELECT,
  dossierLegislatif: { select: { title: true, slug: true } },
} satisfies Prisma.ScrutinSelect;

type ListingRow = Prisma.ScrutinGetPayload<{ select: typeof LISTING_SELECT }>;

/**
 * Fetch one page of scrutins matching `where`, ordered by `sort`.
 *
 * `recent` uses Prisma's native `orderBy` + `skip`/`take`. `close`/`turnout`
 * are computed orders: no raw SQL — fetch the filtered id set via a
 * parameterized Prisma `findMany`, sort in memory (sortScrutinsInMemory),
 * slice the page, then re-fetch full rows for just that page and reorder.
 */
async function fetchSortedPage(
  where: Prisma.ScrutinWhereInput,
  sort: ScrutinSort,
  skip: number,
  limit: number
): Promise<{ scrutins: ListingRow[]; total: number }> {
  if (sort === "recent") {
    const [scrutins, total] = await Promise.all([
      db.scrutin.findMany({
        where,
        orderBy: { votingDate: "desc" },
        skip,
        take: limit,
        select: LISTING_SELECT,
      }),
      db.scrutin.count({ where }),
    ]);
    return { scrutins, total };
  }

  const filtered = await db.scrutin.findMany({
    where,
    select: { id: true, votesFor: true, votesAgainst: true, votesAbstain: true, votingDate: true },
  });
  const ordered = sortScrutinsInMemory(filtered, sort);
  const pageIds = ordered.slice(skip, skip + limit).map((r) => r.id);
  const rows = pageIds.length
    ? await db.scrutin.findMany({ where: { id: { in: pageIds } }, select: LISTING_SELECT })
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const scrutins = pageIds.map((id) => byId.get(id)).filter((r): r is ListingRow => r != null);

  return { scrutins, total: filtered.length };
}

/** Core query logic shared by cached and uncached paths. */
async function queryScrutins(params: {
  page: number;
  limit: number;
  result?: VotingResult;
  legislature?: number;
  chamber?: Chamber;
  theme?: ThemeCategory;
  type?: ScrutinType;
  excludeType?: ScrutinType;
  search?: string;
  explainedOnly?: boolean;
  sort?: ScrutinSort;
}) {
  const {
    page,
    limit,
    result,
    legislature,
    chamber,
    theme,
    type,
    excludeType,
    search,
    explainedOnly,
  } = params;
  // Defense-in-depth: getScrutins already whitelists `sort` before it can
  // reach any "use cache" boundary, so this is a no-op on a well-behaved
  // caller (idempotent on an already-whitelisted value or `undefined`).
  const sort = normalizeSort(params.sort);
  const skip = (page - 1) * limit;

  const where = {
    ...(result && { result }),
    ...(legislature && { legislature }),
    ...(chamber && { chamber }),
    ...(theme && { theme }),
    ...(type && { type }),
    // explainedOnly includes amendments: requested `type` still applies, but
    // `excludeType` (e.g. hiding amendments by default) is ignored.
    ...(!explainedOnly && excludeType && { type: { not: excludeType } }),
    ...(explainedOnly && {
      policyTitle: { is: { status: "APPROVED" as const, policyTitle: { not: null } } },
    }),
    ...(search && {
      OR: [
        { title: { contains: search, mode: "insensitive" as const } },
        { summary: { contains: search, mode: "insensitive" as const } },
        { citizenImpact: { contains: search, mode: "insensitive" as const } },
        {
          dossierLegislatif: {
            title: { contains: search, mode: "insensitive" as const },
          },
        },
        ...(explainedOnly
          ? [
              {
                policyTitle: {
                  is: {
                    status: "APPROVED" as const,
                    OR: [
                      { policyTitle: { contains: search, mode: "insensitive" as const } },
                      { policySubtitle: { contains: search, mode: "insensitive" as const } },
                    ],
                  },
                },
              },
            ]
          : []),
      ],
    }),
  };

  const [{ scrutins, total }, stats] = await Promise.all([
    fetchSortedPage(where, sort, skip, limit),
    db.scrutin.groupBy({
      by: ["result"],
      where,
      _count: true,
    }),
  ]);

  return {
    scrutins,
    total,
    totalPages: Math.ceil(total / limit),
    stats: stats.reduce(
      (acc, s) => {
        acc[s.result] = s._count;
        return acc;
      },
      {} as Record<string, number>
    ),
  };
}

/**
 * Cached path — bounded key space (enums + page, no free-text search).
 * `sort`, if present, is already whitelisted by the caller (getScrutins)
 * before it reaches this "use cache" boundary — never a raw/garbage string.
 * Omitting it (as all pre-existing callers do) keeps the exact same cache
 * key as before this param existed.
 */
async function getScrutinsFiltered(params: {
  page: number;
  limit: number;
  result?: VotingResult;
  legislature?: number;
  chamber?: Chamber;
  theme?: ThemeCategory;
  type?: ScrutinType;
  excludeType?: ScrutinType;
  explainedOnly?: boolean;
  sort?: ScrutinSort;
}) {
  "use cache";
  cacheTag("votes");
  cacheLife("synced");
  return queryScrutins(params);
}

/**
 * Router: use cached path when no search, uncached when searching.
 *
 * Whitelists `sort` here, BEFORE getScrutinsFiltered's "use cache" boundary
 * fixes the cache key from these args. An unwhitelisted value (e.g. a
 * garbage `?sort=` from the URL) must never cross that boundary — it would
 * mint one new, unbounded cache entry per distinct garbage string. `sort` is
 * left untouched when the caller omits it, so the default (no-sort) cache
 * key is unchanged from before this normalization moved here.
 */
export async function getScrutins(params: {
  page: number;
  limit: number;
  result?: VotingResult;
  legislature?: number;
  chamber?: Chamber;
  theme?: ThemeCategory;
  type?: ScrutinType;
  excludeType?: ScrutinType;
  search?: string;
  explainedOnly?: boolean;
  sort?: ScrutinSort;
}) {
  // Whitelist guard: `chamber`, `result` and `theme` arrive raw from the query
  // string (see ScrutinsListing), and an out-of-enum value makes Prisma throw
  // on all three downstream queries (findMany, count, groupBy). Dropping the
  // filter here keeps the listing rendering instead of dying mid-stream.
  const normalized = {
    ...params,
    ...(params.sort === undefined ? {} : { sort: normalizeSort(params.sort) }),
    chamber: pickEnumValue(params.chamber, ChamberEnum),
    result: pickEnumValue(params.result, VotingResultEnum),
    theme: pickEnumValue(params.theme, ThemeCategoryEnum),
  };
  if (normalized.search) {
    return queryScrutins(normalized);
  }
  return getScrutinsFiltered(normalized);
}

export async function getLegislatures() {
  "use cache";
  cacheTag("votes");
  cacheLife("synced");

  return db.scrutin.groupBy({
    by: ["legislature"],
    _count: true,
    orderBy: { legislature: "desc" },
  });
}

export async function getChambers() {
  "use cache";
  cacheTag("votes");
  cacheLife("synced");

  return db.scrutin.groupBy({
    by: ["chamber"],
    _count: true,
  });
}

export async function getThemeCounts() {
  "use cache";
  cacheTag("votes");
  cacheLife("synced");

  const counts = await db.scrutin.groupBy({
    by: ["theme"],
    _count: true,
    orderBy: { _count: { theme: "desc" } },
  });
  return counts.filter((c) => c.theme !== null) as { theme: ThemeCategory; _count: number }[];
}

export async function getTypeCounts() {
  "use cache";
  cacheTag("votes");
  cacheLife("synced");

  return db.scrutin.groupBy({
    by: ["type"],
    _count: true,
  });
}

/** Theme counts including key vote counts for the hub. */
export async function getThemeCountsWithKeyVotes() {
  "use cache";
  cacheTag("votes", "votes-key");
  cacheLife("synced");

  const [allCounts, keyCounts] = await Promise.all([
    db.scrutin.groupBy({
      by: ["theme"],
      _count: true,
      orderBy: { _count: { theme: "desc" } },
    }),
    db.scrutin.groupBy({
      by: ["theme"],
      where: { importance: { isKeyVote: true } },
      _count: true,
    }),
  ]);

  const keyMap = new Map(keyCounts.filter((c) => c.theme).map((c) => [c.theme!, c._count]));

  return allCounts
    .filter((c) => c.theme !== null)
    .map((c) => ({
      theme: c.theme!,
      total: c._count,
      keyVotes: keyMap.get(c.theme!) ?? 0,
    }));
}

// ---------------------------------------------------------------------------
// Hub page — data functions
// ---------------------------------------------------------------------------

/** Last scrutin date, used for parliamentary recess banner. */
export async function getLastScrutinDate(): Promise<Date | null> {
  "use cache";
  cacheTag("votes");
  cacheLife("synced");

  const last = await db.scrutin.findFirst({
    orderBy: { votingDate: "desc" },
    select: { votingDate: true },
  });
  return last?.votingDate ?? null;
}

/** 8 most recent scrutins for the hub page hero section. */
export async function getLatestScrutins() {
  "use cache";
  cacheTag("votes");
  cacheLife("synced");

  return db.scrutin.findMany({
    orderBy: { votingDate: "desc" },
    take: 8,
    select: DAILY_SELECT,
  });
}

/** Today's vote counts by chamber. */
export async function getTodayVotesByChamber(): Promise<{
  AN: number;
  SENAT: number;
  total: number;
  date: string;
}> {
  "use cache";
  cacheTag("votes", "votes-daily");
  cacheLife("synced");

  const dateStr = getParisToday();
  const { start, end } = parseDateRange(dateStr);

  const results = await db.scrutin.groupBy({
    by: ["chamber"],
    where: { votingDate: { gte: start, lt: end } },
    _count: true,
  });

  const AN = results.find((r) => r.chamber === "AN")?._count ?? 0;
  const SENAT = results.find((r) => r.chamber === "SENAT")?._count ?? 0;

  return { AN, SENAT, total: AN + SENAT, date: dateStr };
}

/** Aggregate stats for the hub page: total scrutins + total dossiers. */
export async function getHubStats(): Promise<{
  totalScrutins: number;
  totalDossiers: number;
}> {
  "use cache";
  cacheTag("votes");
  cacheLife("synced");

  const [totalScrutins, totalDossiers] = await Promise.all([
    db.scrutin.count(),
    db.legislativeDossier.count(),
  ]);

  return { totalScrutins, totalDossiers };
}

/** Per-chamber vote count and adoption rate. */
export async function getChamberAdoptionRates(): Promise<
  Array<{
    chamber: Chamber;
    total: number;
    adopted: number;
    adoptionRate: number;
  }>
> {
  "use cache";
  cacheTag("votes");
  cacheLife("synced");

  const results = await db.scrutin.groupBy({
    by: ["chamber", "result"],
    _count: true,
  });

  const byC = new Map<Chamber, { total: number; adopted: number }>();

  for (const r of results) {
    const entry = byC.get(r.chamber) ?? { total: 0, adopted: 0 };
    entry.total += r._count;
    if (r.result === "ADOPTED") entry.adopted += r._count;
    byC.set(r.chamber, entry);
  }

  return Array.from(byC.entries()).map(([chamber, { total, adopted }]) => ({
    chamber,
    total,
    adopted,
    adoptionRate: total > 0 ? Math.round((adopted / total) * 100) : 0,
  }));
}

// ---------------------------------------------------------------------------
// Key votes (parlement-riche hub)
// ---------------------------------------------------------------------------

const KEY_VOTE_SELECT = {
  ...DAILY_SELECT,
  dossierLegislatifId: true, // scalar FK — the per-dossier cap reads it
  importance: { select: { score: true } },
} satisfies Prisma.ScrutinSelect;

type KeyVoteRow = Prisma.ScrutinGetPayload<{ select: typeof KEY_VOTE_SELECT }>;

function toKeyVoteCandidate(s: KeyVoteRow) {
  return {
    id: s.id,
    title: s.title,
    votingDate: s.votingDate,
    dossierLegislatifId: s.dossierLegislatifId ?? null,
    type: s.type,
    importanceScore: s.importance?.score ?? 0,
    _row: s,
  };
}

/**
 * Key votes for the hub hero + grid, ranked by `selectKeyVotes` (importance,
 * recency, procedural weight), capped per dossier and rotated daily. The window
 * widens (30 / 90 / 180 days) only when the narrower one cannot fill the surface,
 * so a parliamentary recess reaches further back instead of emptying the hub.
 * Falls back to the best-scored scrutins when no key vote has been promoted at all.
 */
export async function getKeyVotes(): Promise<{
  hero: (DailyScrutin & { score: number }) | null;
  grid: Array<DailyScrutin & { score: number }>;
}> {
  "use cache";
  cacheTag("votes", "votes-key");
  cacheLife("synced");

  const now = new Date();
  const widestWindow = KEY_VOTES_WINDOWS_DAYS[KEY_VOTES_WINDOWS_DAYS.length - 1]!;
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - widestWindow);

  const selectOpts = {
    now,
    gridCount: KEY_VOTES_GRID_COUNT,
    poolSize: KEY_VOTES_POOL_SIZE,
    maxPerDossier: KEY_VOTES_MAX_PER_DOSSIER,
  };
  const toResult = (picked: { hero: KeyVoteRow | null; grid: KeyVoteRow[] }) => ({
    hero: picked.hero ? { ...picked.hero, score: picked.hero.importance?.score ?? 0 } : null,
    grid: picked.grid.map((s) => ({ ...s, score: s.importance?.score ?? 0 })),
  });
  const pick = (pool: KeyVoteRow[]) => {
    const { hero, grid } = selectKeyVotes(pool.map(toKeyVoteCandidate), selectOpts);
    return { hero: hero?._row ?? null, grid: grid.map((c) => c._row) };
  };

  const rows = await db.scrutin.findMany({
    where: { importance: { isKeyVote: true }, votingDate: { gte: windowStart } },
    orderBy: { votingDate: "desc" },
    take: KEY_VOTES_QUERY_LIMIT,
    select: KEY_VOTE_SELECT,
  });

  let picked: { hero: KeyVoteRow | null; grid: KeyVoteRow[] } = { hero: null, grid: [] };
  for (const days of KEY_VOTES_WINDOWS_DAYS) {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - days);
    picked = pick(rows.filter((r) => r.votingDate >= cutoff));
    if (picked.grid.length >= KEY_VOTES_GRID_COUNT) return toResult(picked);
  }
  if (picked.hero) return toResult(picked);

  // No key vote promoted in the widest window: show the best-scored scrutins
  // rather than an empty hub.
  const fallback = await db.scrutin.findMany({
    where: { importance: { isNot: null }, votingDate: { gte: windowStart } },
    orderBy: { importance: { score: "desc" } },
    take: KEY_VOTES_QUERY_LIMIT,
    select: KEY_VOTE_SELECT,
  });

  return toResult(pick(fallback));
}

// ---------------------------------------------------------------------------
// Votes expliqués showcase
// ---------------------------------------------------------------------------

const EXPLAINED_WINDOWS_DAYS = [90, 180, 365] as const;
const ALL_TIME_FALLBACK_POOL_SIZE = 200;

const EXPLAINED_SELECT = {
  ...DAILY_SELECT,
  dossierLegislatifId: true, // scalar FK — scoring/diversify read s.dossierLegislatifId
  dossierLegislatif: { select: { title: true, slug: true } },
  importance: { select: { score: true, isKeyVote: true } },
  // Override DAILY_SELECT's policyTitle to add `confidence` (needed for scoring),
  // keeping the other fields so VoteCard behaves identically.
  policyTitle: {
    select: {
      status: true,
      policyTitle: true,
      policySubtitle: true,
      officialSourceUrl: true,
      proceduralLabel: true,
      confidence: true,
    },
  },
} satisfies Prisma.ScrutinSelect;

type ExplainedRow = Prisma.ScrutinGetPayload<{ select: typeof EXPLAINED_SELECT }>;

const EXPLAINED_BASE_WHERE = {
  policyTitle: {
    is: {
      status: "APPROVED" as const,
      policyTitle: { not: null },
      confidence: { in: ["HIGH", "MEDIUM"] as const },
    },
  },
} satisfies Prisma.ScrutinWhereInput;

function toExplainedCandidate(s: ExplainedRow) {
  return {
    id: s.id,
    policyTitle: s.policyTitle!.policyTitle as string,
    votingDate: s.votingDate,
    dossierLegislatifId: s.dossierLegislatifId ?? null,
    confidence: s.policyTitle!.confidence,
    importance: s.importance,
    _row: s,
  };
}

/**
 * Curated "Votes expliqués" showcase: best APPROVED HIGH/MEDIUM policy titles,
 * ranked by scoreExplainedVote and de-duplicated by diversify. Uses an adaptive
 * window (90/180/365 days, widening only if needed) and falls back to a
 * bounded all-time pool when recent windows can't fill `count`.
 */
export async function getExplainedShowcase(opts: {
  count: number;
  maxPerDossier: number;
  excludeScrutinIds?: string[];
}) {
  "use cache";
  cacheTag("votes", "votes-explained");
  cacheLife("synced");

  // 1. one 365-day query, newest first
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 365);
  let rows = await db.scrutin.findMany({
    where: { ...EXPLAINED_BASE_WHERE, votingDate: { gte: windowStart } },
    orderBy: { votingDate: "desc" },
    select: EXPLAINED_SELECT,
    take: 400,
  });

  const now = new Date();
  const pick = (pool: ExplainedRow[]) => {
    const cands = pool
      .map(toExplainedCandidate)
      .sort((a, b) => scoreExplainedVote(b, now) - scoreExplainedVote(a, now));
    return diversify(cands, opts).map((c) => c._row);
  };

  // 2. progressively wider in-memory sub-windows
  let diversified: ExplainedRow[] = [];
  for (const days of EXPLAINED_WINDOWS_DAYS) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const sub = rows.filter((r) => r.votingDate >= cutoff);
    diversified = pick(sub);
    if (diversified.length >= opts.count) return diversified.slice(0, opts.count);
  }

  // 3. bounded all-time fallback — gate on the last window's diversified
  // output, not the raw row count (rows.length stays ~400 regardless of
  // whether diversify() shrank the result below opts.count).
  if (diversified.length < opts.count) {
    rows = await db.scrutin.findMany({
      where: EXPLAINED_BASE_WHERE,
      orderBy: { votingDate: "desc" },
      select: EXPLAINED_SELECT,
      take: ALL_TIME_FALLBACK_POOL_SIZE,
    });
  }
  return pick(rows).slice(0, opts.count);
}
