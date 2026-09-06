import { cacheTag, cacheLife } from "next/cache";
import { db } from "@/lib/db";
import { Chamber, MandateType } from "@/generated/prisma";
import type { ThemeCategory } from "@/generated/prisma";
import { THEME_CATEGORY_LABELS, THEME_CATEGORY_ICONS } from "@/config/labels";
import {
  participationStatusFor,
  resolveCurrentParliamentaryMandate,
  resolveParticipationStatus,
  roundParticipationRate,
  type ParticipationStatus,
} from "@/lib/votes/participation-publication";
import { computeTargetedPoliticianDissidence } from "@/services/politician-dissidence";

// ============================================
// Types
// ============================================

export interface PartyVoteStats {
  partyId: string;
  partyName: string;
  partyShortName: string;
  partyColor: string | null;
  partySlug: string | null;
  totalVotes: number;
  pour: number;
  contre: number;
  abstention: number;
  nonVotant: number;
  absentVoteRows: number;
  cohesionRate: number;
  participationRate: number | null;
  participationStatus: ParticipationStatus;
}

export interface DivisiveScrutin {
  id: string;
  slug: string | null;
  title: string;
  votingDate: Date;
  chamber: Chamber;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  divisionScore: number;
}

export interface VoteStatsResult {
  global: {
    totalScrutins: number;
    totalVotesFor: number;
    totalVotesAgainst: number;
    totalVotesAbstain: number;
    participationRate: number | null;
    participationStatus: ParticipationStatus;
    anScrutins: number;
    senatScrutins: number;
    adoptes: number;
    rejetes: number;
  };
  parties: PartyVoteStats[];
  divisiveScrutins: DivisiveScrutin[];
}

// ============================================
// Service
// ============================================

/**
 * Get comprehensive vote statistics.
 * Replaces the N+1 query pattern (165 queries) with a single raw SQL query.
 */
async function getVoteStats(
  chamber?: Chamber,
  options?: { partyLimit?: number; divisiveLimit?: number }
): Promise<VoteStatsResult> {
  const partyLimit = options?.partyLimit ?? 15;
  const divisiveLimit = options?.divisiveLimit ?? 10;

  const [partyRows, divisiveScrutins, globalStats, chamberCounts] = await Promise.all([
    // 1. Party vote stats: single query replaces 165 N+1 queries
    getPartyVoteRows(chamber),

    // 2. Divisive scrutins
    getDivisiveScrutins(chamber, divisiveLimit),

    // 3. Global aggregate stats
    db.scrutin.aggregate({
      where: chamber ? { chamber } : {},
      _count: true,
      _sum: {
        votesFor: true,
        votesAgainst: true,
        votesAbstain: true,
      },
    }),

    // 4. Chamber breakdown + adopted/rejected
    getChamberCounts(chamber),
  ]);

  // Aggregate party rows into stats
  const parties = aggregatePartyStats(partyRows, partyLimit);
  const aggregateParticipationStatus = resolveParticipationStatus({
    chamber,
    hasApplicableMandate: false,
    eligibleScrutins: null,
    methodSupported: false,
  });
  for (const party of parties) party.participationStatus = aggregateParticipationStatus;

  return {
    global: {
      totalScrutins: globalStats._count,
      totalVotesFor: globalStats._sum.votesFor || 0,
      totalVotesAgainst: globalStats._sum.votesAgainst || 0,
      totalVotesAbstain: globalStats._sum.votesAbstain || 0,
      participationRate: null,
      participationStatus: aggregateParticipationStatus,
      anScrutins: chamberCounts.an,
      senatScrutins: chamberCounts.senat,
      adoptes: chamberCounts.adoptes,
      rejetes: chamberCounts.rejetes,
    },
    parties,
    divisiveScrutins,
  };
}

// ============================================
// Internal queries
// ============================================

interface PartyVoteRow {
  partyId: string;
  partyName: string;
  partyShortName: string;
  partyColor: string | null;
  partySlug: string | null;
  position: string;
  count: bigint;
}

async function getPartyVoteRows(chamber?: Chamber): Promise<PartyVoteRow[]> {
  if (chamber) {
    return db.$queryRaw<PartyVoteRow[]>`
      SELECT
        p.id as "partyId",
        p.name as "partyName",
        p."shortName" as "partyShortName",
        p.color as "partyColor",
        p.slug as "partySlug",
        v.position,
        COUNT(v.id) as count
      FROM "Vote" v
      JOIN "Politician" pol ON v."politicianId" = pol.id
      JOIN "Party" p ON pol."currentPartyId" = p.id
      JOIN "Scrutin" s ON v."scrutinId" = s.id
      WHERE s.chamber = ${chamber}::"Chamber"
      GROUP BY p.id, p.name, p."shortName", p.color, p.slug, v.position
      ORDER BY COUNT(v.id) DESC
    `;
  }

  return db.$queryRaw<PartyVoteRow[]>`
    SELECT
      p.id as "partyId",
      p.name as "partyName",
      p."shortName" as "partyShortName",
      p.color as "partyColor",
      p.slug as "partySlug",
      v.position,
      COUNT(v.id) as count
    FROM "Vote" v
    JOIN "Politician" pol ON v."politicianId" = pol.id
    JOIN "Party" p ON pol."currentPartyId" = p.id
    JOIN "Scrutin" s ON v."scrutinId" = s.id
    GROUP BY p.id, p.name, p."shortName", p.color, p.slug, v.position
    ORDER BY COUNT(v.id) DESC
  `;
}

function aggregatePartyStats(rows: PartyVoteRow[], limit: number): PartyVoteStats[] {
  const partyMap = new Map<string, PartyVoteStats>();

  for (const row of rows) {
    if (!partyMap.has(row.partyId)) {
      partyMap.set(row.partyId, {
        partyId: row.partyId,
        partyName: row.partyName,
        partyShortName: row.partyShortName,
        partyColor: row.partyColor,
        partySlug: row.partySlug,
        totalVotes: 0,
        pour: 0,
        contre: 0,
        abstention: 0,
        nonVotant: 0,
        absentVoteRows: 0,
        cohesionRate: 0,
        participationRate: null,
        participationStatus: participationStatusFor(undefined),
      });
    }

    const stats = partyMap.get(row.partyId)!;
    const count = Number(row.count);
    stats.totalVotes += count;

    switch (row.position) {
      case "POUR":
        stats.pour = count;
        break;
      case "CONTRE":
        stats.contre = count;
        break;
      case "ABSTENTION":
        stats.abstention = count;
        break;
      case "NON_VOTANT":
        stats.nonVotant = count;
        break;
      case "ABSENT":
        stats.absentVoteRows = count;
        break;
    }
  }

  // Calculate rates
  for (const stats of partyMap.values()) {
    const participating = stats.pour + stats.contre + stats.abstention;
    const maxPosition = Math.max(stats.pour, stats.contre, stats.abstention);
    stats.cohesionRate = participating > 0 ? Math.round((maxPosition / participating) * 100) : 0;
  }

  return Array.from(partyMap.values())
    .filter((p) => p.totalVotes >= 100)
    .sort((a, b) => b.totalVotes - a.totalVotes)
    .slice(0, limit);
}

async function getDivisiveScrutins(
  chamber?: Chamber,
  limit: number = 10
): Promise<DivisiveScrutin[]> {
  let rows: {
    id: string;
    slug: string | null;
    title: string;
    votingDate: Date;
    chamber: Chamber;
    votesFor: number;
    votesAgainst: number;
    votesAbstain: number;
  }[];

  if (chamber) {
    rows = await db.$queryRaw`
      SELECT
        s.id,
        s.slug,
        s.title,
        s."votingDate",
        s.chamber,
        s."votesFor",
        s."votesAgainst",
        s."votesAbstain"
      FROM "Scrutin" s
      WHERE s."votesFor" > 10 AND s."votesAgainst" > 10
        AND s.chamber = ${chamber}::"Chamber"
      ORDER BY
        ABS(s."votesFor" - s."votesAgainst")::float / NULLIF(s."votesFor" + s."votesAgainst", 0) ASC,
        s."votingDate" DESC
      LIMIT ${limit}
    `;
  } else {
    rows = await db.$queryRaw`
      SELECT
        s.id,
        s.slug,
        s.title,
        s."votingDate",
        s.chamber,
        s."votesFor",
        s."votesAgainst",
        s."votesAbstain"
      FROM "Scrutin" s
      WHERE s."votesFor" > 10 AND s."votesAgainst" > 10
      ORDER BY
        ABS(s."votesFor" - s."votesAgainst")::float / NULLIF(s."votesFor" + s."votesAgainst", 0) ASC,
        s."votingDate" DESC
      LIMIT ${limit}
    `;
  }

  return rows.map((s) => ({
    ...s,
    divisionScore: Math.round(
      100 - (Math.abs(s.votesFor - s.votesAgainst) / (s.votesFor + s.votesAgainst)) * 100
    ),
  }));
}

async function getChamberCounts(chamber?: Chamber) {
  const resultScope = chamber ? { chamber } : {};
  const [an, senat, adoptes, rejetes] = await Promise.all([
    db.scrutin.count({ where: { chamber: "AN" } }),
    db.scrutin.count({ where: { chamber: "SENAT" } }),
    db.scrutin.count({ where: { result: "ADOPTED", ...resultScope } }),
    db.scrutin.count({ where: { result: "REJECTED", ...resultScope } }),
  ]);

  return { an, senat, adoptes, rejetes };
}

// ============================================
// Per-politician voting stats
// ============================================

export interface PoliticianVotingStats {
  total: number;
  pour: number;
  contre: number;
  abstention: number;
  nonVotant: number;
  eligibleScrutins: number | null;
  scrutinsSansVoteEnregistre: number | null;
  participationRate: number | null;
  participationStatus: ParticipationStatus;
}

/**
 * Compute voting stats for a single politician.
 * Shared by politician profile, votes subpage, and API route.
 */
export async function getPoliticianVotingStats(
  politicianId: string,
  mandateType?: MandateType
): Promise<PoliticianVotingStats> {
  "use cache";
  // Per-politician aggregate, identical across page/tab navigations — cache it so
  // it is computed once per politician per window instead of on every page view
  // (this groupBy was ~15% of total DB time). Invalidated by the votes/politicians
  // cache tags after a sync.
  cacheTag("votes", "politicians");
  cacheLife("synced");

  // Resolve the complete current parliamentary perimeter before applying a requested view.
  // `take: 2` is sufficient to distinguish zero, exactly one, and multiple mandates.
  const currentParliamentaryMandates = await db.mandate.findMany({
    where: {
      politicianId,
      isCurrent: true,
      type: { in: ["DEPUTE", "SENATEUR"] },
    },
    select: { startDate: true, endDate: true, type: true },
    take: 2,
  });
  const currentResolution = resolveCurrentParliamentaryMandate(
    currentParliamentaryMandates,
    mandateType
  );
  const currentMandate = currentResolution.applicableMandate;
  const currentMandatesAreAmbiguous = currentParliamentaryMandates.length > 1;
  const explicitMandateContradictsCurrent =
    currentParliamentaryMandates.length === 1 &&
    mandateType !== undefined &&
    currentParliamentaryMandates[0]?.type !== mandateType;

  // A historical mandate resolves the chamber only. It does not make the historical
  // participation computation publishable because its eligibility perimeter is not audited.
  const historicalMandate =
    currentParliamentaryMandates.length > 0 || mandateType
      ? null
      : await db.mandate.findFirst({
          where: {
            politicianId,
            type: { in: ["DEPUTE", "SENATEUR"] },
          },
          orderBy: { startDate: "desc" },
          select: { type: true },
        });
  // The chamber used to display vote rows is intentionally independent from the
  // applicable participation mandate. An explicit historical view may still show votes.
  const displayMandateType = mandateType ?? currentMandate?.type ?? historicalMandate?.type;
  const displayChamber = displayMandateType
    ? displayMandateType === "DEPUTE"
      ? ("AN" as const)
      : ("SENAT" as const)
    : undefined;
  const stats = displayChamber
    ? await db.vote.groupBy({
        by: ["position"],
        where: {
          politicianId,
          chamber: displayChamber,
          ...(currentMandate?.startDate && {
            votingDate: {
              gte: currentMandate.startDate,
              ...(currentMandate.endDate ? { lte: currentMandate.endDate } : {}),
            },
          }),
        },
        _count: true,
      })
    : [];

  const votingStats: PoliticianVotingStats = {
    total: 0,
    pour: 0,
    contre: 0,
    abstention: 0,
    nonVotant: 0,
    eligibleScrutins: null,
    scrutinsSansVoteEnregistre: null,
    participationRate: null,
    participationStatus:
      currentMandatesAreAmbiguous || explicitMandateContradictsCurrent
        ? "COMPUTATION_INCOMPLETE"
        : currentMandate
          ? currentResolution.status
          : participationStatusFor(displayChamber),
  };

  for (const s of stats) {
    votingStats.total += s._count;
    switch (s.position) {
      case "POUR":
        votingStats.pour = s._count;
        break;
      case "CONTRE":
        votingStats.contre = s._count;
        break;
      case "ABSTENTION":
        votingStats.abstention = s._count;
        break;
      case "NON_VOTANT":
        votingStats.nonVotant = s._count;
        break;
    }
  }

  // Compute participation only for an applicable AN mandate with a valid denominator.
  if (currentMandate?.startDate && currentMandate.type === "DEPUTE") {
    const eligibleRows = await db.$queryRaw<[{ count: number }]>`
      SELECT COUNT(*)::int as "count"
      FROM "Scrutin" s
      WHERE s.chamber = 'AN'::"Chamber"
        AND s."votingDate" >= ${currentMandate.startDate}
        AND (${currentMandate.endDate}::timestamp IS NULL OR s."votingDate" <= ${currentMandate.endDate})
    `;
    const eligibleScrutins = eligibleRows[0]?.count ?? 0;
    votingStats.eligibleScrutins = eligibleScrutins;
    votingStats.participationStatus = resolveParticipationStatus({
      chamber: "AN",
      hasApplicableMandate: true,
      eligibleScrutins,
      methodSupported: true,
    });

    if (votingStats.participationStatus === "AVAILABLE") {
      votingStats.scrutinsSansVoteEnregistre = Math.max(0, eligibleScrutins - votingStats.total);
      const expressed = votingStats.pour + votingStats.contre + votingStats.abstention;
      votingStats.participationRate = roundParticipationRate(expressed, eligibleScrutins);
    }
  }

  return votingStats;
}

/**
 * Per-politician vote tab counts (total + amendments), identical across pages of
 * the votes view. Cached so the votes page derives every tab's count from one
 * cached call instead of re-counting (with a Scrutin join for amendments) on
 * every page/tab navigation. Invalidated by the votes/politicians cache tags.
 */
export async function getPoliticianVoteTabCounts(
  politicianId: string
): Promise<{ totalAll: number; amendmentCount: number; nonAmendmentCount: number }> {
  "use cache";
  cacheTag("votes", "politicians");
  cacheLife("synced");

  // Filters the denormalized Vote.scrutinType directly (Issue #377) to drop the
  // forced JOIN on Scrutin. nonAmendmentCount uses the same `{ not: "AMENDEMENT" }`
  // filter as the list query (matches the "Textes de loi" tab exactly even if a
  // scrutin's type is null — `not` excludes nulls), rather than deriving by subtraction.
  const [totalAll, amendmentCount, nonAmendmentCount] = await Promise.all([
    db.vote.count({ where: { politicianId } }),
    db.vote.count({ where: { politicianId, scrutinType: "AMENDEMENT" } }),
    db.vote.count({ where: { politicianId, scrutinType: { not: "AMENDEMENT" } } }),
  ]);
  return { totalAll, amendmentCount, nonAmendmentCount };
}

/**
 * Chambers represented in a politician's recorded vote corpus.
 *
 * Vote.chamber is denormalized and covered by the
 * [politicianId, chamber, votingDate] index, so this query needs no Scrutin join.
 * Consumers must treat [] and ["AN", "SENAT"] as neutral rather than inferring
 * a chamber from the politician's mandates.
 */
export async function getPoliticianVoteChamberCoverage(politicianId: string): Promise<Chamber[]> {
  "use cache";
  cacheTag("votes", "politicians");
  cacheLife("synced");

  const rows = await db.vote.groupBy({
    by: ["chamber"],
    where: { politicianId },
  });

  return rows.map(({ chamber }) => chamber);
}

// ============================================
// Participation ranking
// ============================================

export interface ParticipationRankingEntry {
  politicianId: string;
  firstName: string;
  lastName: string;
  slug: string;
  photoUrl: string | null;
  partyId: string | null;
  partyShortName: string | null;
  partyColor: string | null;
  partySlug: string | null;
  groupCode: string | null;
  groupName: string | null;
  groupColor: string | null;
  mandateType: string;
  votesCount: number;
  eligibleScrutins: number;
  participationRate: number;
  dissidenceRate: number | null;
}

export interface ParticipationRankingResult {
  entries: ParticipationRankingEntry[];
  total: number;
}

/** Fail closed until persisted rows carry a trusted computation version. */
async function getParticipationRanking(
  _chamber?: Chamber,
  _partyId?: string,
  _page: number = 1,
  _pageSize: number = 50,
  _sortDirection: "ASC" | "DESC" = "ASC"
): Promise<ParticipationRankingResult> {
  // Historical rows have no computation version. Publishing a ranking before a
  // trusted AN recompute could reuse the former numerator, so the reader fails closed.
  return { entries: [], total: 0 };
}

// ============================================
// Party participation stats
// ============================================

export interface PartyParticipationStats {
  partyId: string;
  partyName: string;
  partyShortName: string;
  partyColor: string | null;
  partySlug: string | null;
  avgParticipationRate: number;
  memberCount: number;
}

/** Fail closed until snapshots carry a trusted computation version. */
async function getPartyParticipationStats(_chamber?: Chamber): Promise<PartyParticipationStats[]> {
  // Snapshots are unversioned and may contain the former participation definition.
  return [];
}

// ============================================
// Group participation stats (by parliamentary group)
// ============================================

export interface GroupParticipationStats {
  groupId: string;
  groupName: string;
  groupCode: string;
  groupColor: string | null;
  groupChamber: string;
  avgParticipationRate: number;
  memberCount: number;
}

// ============================================
// Legislative stats types
// ============================================

export interface LegislativeKpi {
  scrutinsAnalyses: number;
  dossiersEnDiscussion: number;
  textesAdoptes: number;
}

export interface ThemeDistribution {
  theme: string;
  label: string;
  icon: string;
  count: number;
}

export interface PipelineRow {
  theme: string;
  label: string;
  icon: string;
  depose: number;
  enCommission: number;
  enCours: number;
  adopte: number;
  rejete: number;
  total: number;
}

export interface KeyVote {
  id: string;
  slug: string | null;
  title: string;
  votingDate: string;
  theme: string | null;
  themeLabel: string | null;
  themeIcon: string | null;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  result: string;
  contestationScore: number;
}

export interface LegislativeStatsResult {
  kpi: LegislativeKpi;
  themesAN: ThemeDistribution[];
  themesSENAT: ThemeDistribution[];
  pipeline: PipelineRow[];
  keyVotesAN: KeyVote[];
  keyVotesSENAT: KeyVote[];
}

/** Fail closed until snapshots carry a trusted computation version. */
async function getGroupParticipationStats(_chamber?: Chamber): Promise<GroupParticipationStats[]> {
  // Snapshots are unversioned and may contain the former participation definition.
  return [];
}

// ============================================
// Per-politician participation card data
// ============================================

export interface PoliticianParliamentaryCardData {
  chamber: "AN" | "SENAT";
  mandateType: "DEPUTE" | "SENATEUR";
  votesCount: number;
  eligibleScrutins: number | null;
  participationRate: number | null;
  participationStatus: ParticipationStatus;
  rank: number | null;
  totalPeers: number | null;
  dissidenceRate: number | null;
  dissidenceCount: number | null;
  dissidenceTotal: number | null;
}

/** Compute the individual card from the live, chamber-bounded publication policy. */
export async function getPoliticianParliamentaryCard(
  politicianId: string,
  mandateType: "DEPUTE" | "SENATEUR"
): Promise<PoliticianParliamentaryCardData | null> {
  const chamber: Chamber = mandateType === "DEPUTE" ? "AN" : "SENAT";

  const [stats, dissidence] = await Promise.all([
    getPoliticianVotingStats(politicianId, mandateType),
    getPoliticianDissidence(politicianId),
  ]);

  return {
    chamber,
    mandateType,
    votesCount: stats.pour + stats.contre + stats.abstention,
    eligibleScrutins: stats.eligibleScrutins,
    participationRate: stats.participationRate,
    participationStatus: stats.participationStatus,
    rank: null,
    totalPeers: null,
    dissidenceRate: dissidence?.rate ?? null,
    dissidenceCount: dissidence?.count ?? null,
    dissidenceTotal: dissidence?.total ?? null,
  };
}

export async function getPoliticianDissidence(
  politicianId: string
): Promise<{ count: number; total: number; rate: number } | null> {
  return computeTargetedPoliticianDissidence(politicianId);
}

// ============================================
// Legislative stats (from StatsSnapshot)
// ============================================

/**
 * Get legislative stats from pre-computed StatsSnapshot table.
 * Reads all 6 legislative snapshot keys in a single query.
 */
async function getLegislativeStats(): Promise<LegislativeStatsResult> {
  const keys = [
    "legislative-kpi",
    "legislative-themes-AN",
    "legislative-themes-SENAT",
    "legislative-pipeline",
    "legislative-votes-AN",
    "legislative-votes-SENAT",
  ];

  const snapshots = await db.statsSnapshot.findMany({
    where: { key: { in: keys } },
    take: 10,
  });

  const snapshotMap = new Map(snapshots.map((s) => [s.key, s.data]));

  return {
    kpi: (snapshotMap.get("legislative-kpi") as unknown as LegislativeKpi) || {
      scrutinsAnalyses: 0,
      dossiersEnDiscussion: 0,
      textesAdoptes: 0,
    },
    themesAN: (snapshotMap.get("legislative-themes-AN") as unknown as ThemeDistribution[]) || [],
    themesSENAT:
      (snapshotMap.get("legislative-themes-SENAT") as unknown as ThemeDistribution[]) || [],
    pipeline: (snapshotMap.get("legislative-pipeline") as unknown as PipelineRow[]) || [],
    keyVotesAN: (snapshotMap.get("legislative-votes-AN") as unknown as KeyVote[]) || [],
    keyVotesSENAT: (snapshotMap.get("legislative-votes-SENAT") as unknown as KeyVote[]) || [],
  };
}

// ============================================
// Per-politician theme distribution
// ============================================

export interface PoliticianThemeDistribution {
  theme: string;
  label: string;
  icon: string;
  pour: number;
  contre: number;
  abstention: number;
  total: number;
}

export async function getPoliticianThemeDistribution(
  politicianId: string
): Promise<PoliticianThemeDistribution[]> {
  // Theme distribution is computed from expressed votes, not from participation. Reading it
  // directly keeps historical Senate participation rows out of this unrelated public feature.
  const rows = await db.$queryRaw<
    { theme: string; pour: number; contre: number; abstention: number; total: number }[]
  >`
    SELECT s.theme::text,
      COUNT(*) FILTER (WHERE v.position = 'POUR')::int as pour,
      COUNT(*) FILTER (WHERE v.position = 'CONTRE')::int as contre,
      COUNT(*) FILTER (WHERE v.position = 'ABSTENTION')::int as abstention,
      COUNT(*)::int as total
    FROM "Vote" v
    JOIN "Scrutin" s ON s.id = v."scrutinId"
    WHERE v."politicianId" = ${politicianId}
      AND s.theme IS NOT NULL
      AND v.position IN ('POUR', 'CONTRE', 'ABSTENTION')
    GROUP BY s.theme
  `;

  return rows
    .map((row) => ({
      ...row,
      label: THEME_CATEGORY_LABELS[row.theme as ThemeCategory] || row.theme,
      icon: THEME_CATEGORY_ICONS[row.theme as ThemeCategory] || "",
    }))
    .sort((a, b) => b.total - a.total);
}

// ============================================
// Group dissidence stats
// ============================================

export interface GroupDissidenceStats {
  groupId: string;
  groupCode: string;
  groupName: string;
  groupColor: string | null;
  groupChamber: string;
  avgDissidenceRate: number;
  memberCount: number;
}

async function getGroupDissidenceStats(chamber: "AN" | "SENAT"): Promise<GroupDissidenceStats[]> {
  const key = `group-dissidence-${chamber}`;
  const snapshot = await db.statsSnapshot.findUnique({ where: { key } });
  if (snapshot) return snapshot.data as unknown as GroupDissidenceStats[];
  return [];
}

// ============================================
// Group dynamics (alignment + cohesion from ParliamentaryGroupStats)
// ============================================

export interface GroupDynamicsStats {
  groupId: string;
  groupCode: string;
  groupName: string;
  groupColor: string | null;
  groupSlug: string | null;
  chamber: string;
  cohesionPct: number;
  governmentAlignmentPct: number;
  averageParticipationPct: number | null;
}

async function getGroupDynamicsStats(chamber: "AN" | "SENAT"): Promise<GroupDynamicsStats[]> {
  const legislature = chamber === "AN" ? 17 : 2023;

  const stats = await db.parliamentaryGroupStats.findMany({
    where: { legislature },
    include: {
      group: {
        select: { code: true, name: true, color: true, slug: true, chamber: true },
      },
    },
    orderBy: { governmentAlignmentPct: "desc" },
  });

  return stats.map((s) => ({
    groupId: s.groupId,
    groupCode: s.group.code,
    groupName: s.group.name,
    groupColor: s.group.color,
    groupSlug: s.group.slug,
    chamber: s.group.chamber,
    cohesionPct: s.cohesionPct,
    governmentAlignmentPct: s.governmentAlignmentPct,
    // ParliamentaryGroupStats contains an independent legacy formula. It is never public.
    averageParticipationPct: null,
  }));
}

// ============================================
// Export
// ============================================

export const voteStatsService = {
  getVoteStats,
  getPoliticianVotingStats,
  getParticipationRanking,
  getPartyParticipationStats,
  getGroupParticipationStats,
  getPoliticianParliamentaryCard,
  getLegislativeStats,
  getPoliticianThemeDistribution,
  getGroupDissidenceStats,
  getGroupDynamicsStats,
};
