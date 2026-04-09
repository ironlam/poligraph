import { db } from "@/lib/db";
import { Chamber, MandateType, Prisma } from "@/generated/prisma";
import type { ThemeCategory } from "@/generated/prisma";
import { THEME_CATEGORY_LABELS, THEME_CATEGORY_ICONS } from "@/config/labels";

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
  absent: number;
  cohesionRate: number;
  participationRate: number;
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
    participationRate: number;
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

  const [partyRows, divisiveScrutins, globalStats, participationRow, chamberCounts] =
    await Promise.all([
      // 1. Party vote stats — single query replaces 165 N+1 queries
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

      // 4. Global participation rate
      getGlobalParticipation(chamber),

      // 5. Chamber breakdown + adopted/rejected
      getChamberCounts(chamber),
    ]);

  // Aggregate party rows into stats
  const parties = aggregatePartyStats(partyRows, partyLimit);

  return {
    global: {
      totalScrutins: globalStats._count,
      totalVotesFor: globalStats._sum.votesFor || 0,
      totalVotesAgainst: globalStats._sum.votesAgainst || 0,
      totalVotesAbstain: globalStats._sum.votesAbstain || 0,
      participationRate:
        participationRow.total > 0
          ? Math.round((participationRow.participating / participationRow.total) * 100)
          : 0,
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
        absent: 0,
        cohesionRate: 0,
        participationRate: 0,
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
        stats.absent = count;
        break;
    }
  }

  // Calculate rates
  for (const stats of partyMap.values()) {
    const participating = stats.pour + stats.contre + stats.abstention;
    const countedForParticipation = stats.totalVotes - stats.nonVotant;
    stats.participationRate =
      countedForParticipation > 0 ? Math.round((participating / countedForParticipation) * 100) : 0;

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

/**
 * Get global participation from pre-computed PoliticianParticipation table.
 * Sums votesCount and eligibleScrutins across all politicians.
 */
async function getGlobalParticipation(
  chamber?: Chamber
): Promise<{ participating: number; total: number }> {
  const where: Record<string, unknown> = {};
  if (chamber) where.chamber = chamber;

  const result = await db.politicianParticipation.aggregate({
    where,
    _sum: { votesCount: true, eligibleScrutins: true },
  });

  return {
    participating: result._sum.votesCount ?? 0,
    total: result._sum.eligibleScrutins ?? 0,
  };
}

async function getChamberCounts(chamber?: Chamber) {
  const rows = await db.$queryRaw<
    [{ an: number; senat: number; adoptes: number; rejetes: number }]
  >`
    SELECT
      COUNT(*) FILTER (WHERE chamber = 'AN'::"Chamber")::int as an,
      COUNT(*) FILTER (WHERE chamber = 'SENAT'::"Chamber")::int as senat,
      COUNT(*) FILTER (WHERE result = 'ADOPTED' ${chamber ? Prisma.sql`AND chamber = ${chamber}::"Chamber"` : Prisma.sql``})::int as adoptes,
      COUNT(*) FILTER (WHERE result = 'REJECTED' ${chamber ? Prisma.sql`AND chamber = ${chamber}::"Chamber"` : Prisma.sql``})::int as rejetes
    FROM "Scrutin"
  `;

  return rows[0];
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
  absent: number;
  participationRate: number;
}

/**
 * Compute voting stats for a single politician.
 * Shared by politician profile, votes subpage, and API route.
 */
export async function getPoliticianVotingStats(
  politicianId: string,
  mandateType?: MandateType
): Promise<PoliticianVotingStats> {
  // Find current parliamentary mandate first — we need it to scope vote counts
  const mandate = await db.mandate.findFirst({
    where: {
      politicianId,
      isCurrent: true,
      type: mandateType ?? { in: ["DEPUTE", "SENATEUR"] },
    },
    select: { startDate: true, endDate: true, type: true },
  });

  // Scope votes to the current mandate period to avoid mixing legislatures
  const chamber = mandate
    ? mandate.type === "DEPUTE"
      ? ("AN" as const)
      : ("SENAT" as const)
    : undefined;
  const voteWhere = {
    politicianId,
    ...(mandate && {
      chamber,
      votingDate: {
        gte: mandate.startDate!,
        ...(mandate.endDate ? { lte: mandate.endDate } : {}),
      },
    }),
  };

  const stats = await db.vote.groupBy({
    by: ["position"],
    where: voteWhere,
    _count: true,
  });

  const votingStats: PoliticianVotingStats = {
    total: 0,
    pour: 0,
    contre: 0,
    abstention: 0,
    nonVotant: 0,
    absent: 0,
    participationRate: 0,
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
      case "ABSENT":
        votingStats.absent = s._count;
        break;
    }
  }

  // Compute participation based on eligible scrutins during mandate period
  if (mandate) {
    const eligibleRows = await db.$queryRaw<[{ count: number }]>`
      SELECT COUNT(*)::int as "count"
      FROM "Scrutin" s
      WHERE s.chamber = ${chamber!}::"Chamber"
        AND s."votingDate" >= ${mandate.startDate}
        AND (${mandate.endDate}::timestamp IS NULL OR s."votingDate" <= ${mandate.endDate})
    `;
    const eligibleScrutins = eligibleRows[0]?.count ?? 0;

    if (eligibleScrutins > 0) {
      votingStats.absent = Math.max(0, eligibleScrutins - votingStats.total);
      votingStats.participationRate = Math.round((votingStats.total / eligibleScrutins) * 100);
    }
  } else {
    // Fallback: no active parliamentary mandate — use old ratio
    const expressed = votingStats.pour + votingStats.contre + votingStats.abstention;
    const countedForParticipation = votingStats.total - votingStats.nonVotant;
    votingStats.participationRate =
      countedForParticipation > 0 ? Math.round((expressed / countedForParticipation) * 100) : 0;
  }

  return votingStats;
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

/**
 * Get participation ranking from pre-computed PoliticianParticipation table.
 * Returns empty results if table has not been populated yet (run sync:compute-stats).
 */
async function getParticipationRanking(
  chamber?: Chamber,
  partyId?: string,
  page: number = 1,
  pageSize: number = 50,
  sortDirection: "ASC" | "DESC" = "ASC"
): Promise<ParticipationRankingResult> {
  const offset = (page - 1) * pageSize;

  // Build Prisma where filter
  const where: Record<string, unknown> = {};
  if (chamber) where.chamber = chamber;
  if (partyId) where.partyId = partyId;

  const [entries, total] = await Promise.all([
    db.politicianParticipation.findMany({
      where,
      orderBy: [
        { participationRate: sortDirection === "DESC" ? "desc" : "asc" },
        { eligibleScrutins: "desc" },
      ],
      skip: offset,
      take: pageSize,
    }),
    db.politicianParticipation.count({ where }),
  ]);

  return { entries, total };
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

/**
 * Get average participation rate per party from pre-computed StatsSnapshot.
 */
async function getPartyParticipationStats(chamber?: Chamber): Promise<PartyParticipationStats[]> {
  const key = chamber ? `party-participation-${chamber}` : "party-participation";
  const snapshot = await db.statsSnapshot.findUnique({ where: { key } });

  if (snapshot) {
    return snapshot.data as unknown as PartyParticipationStats[];
  }

  // Fallback: empty array if not yet computed
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

/**
 * Get average participation rate per parliamentary group from pre-computed StatsSnapshot.
 */
async function getGroupParticipationStats(chamber?: Chamber): Promise<GroupParticipationStats[]> {
  const key = chamber ? `group-participation-${chamber}` : "group-participation";
  const snapshot = await db.statsSnapshot.findUnique({ where: { key } });

  if (snapshot) {
    return snapshot.data as unknown as GroupParticipationStats[];
  }

  // Fallback: empty array if not yet computed
  return [];
}

// ============================================
// Per-politician participation card data
// ============================================

export interface PoliticianParliamentaryCardData {
  chamber: "AN" | "SENAT";
  mandateType: "DEPUTE" | "SENATEUR";
  votesCount: number;
  eligibleScrutins: number;
  participationRate: number;
  rank: number;
  totalPeers: number;
  dissidenceRate: number | null;
  dissidenceCount: number | null;
  dissidenceTotal: number | null;
}

/**
 * Get participation rank and stats for a single politician.
 * Uses the pre-computed PoliticianParticipation table with window functions.
 */
export async function getPoliticianParliamentaryCard(
  politicianId: string,
  mandateType: "DEPUTE" | "SENATEUR"
): Promise<PoliticianParliamentaryCardData | null> {
  const chamber: Chamber = mandateType === "DEPUTE" ? "AN" : "SENAT";

  const entry = await db.politicianParticipation.findUnique({
    where: { politicianId },
  });

  if (!entry || entry.chamber !== chamber) return null;

  // Count how many have higher participation (= rank)
  const [higherCount, totalPeers] = await Promise.all([
    db.politicianParticipation.count({
      where: {
        chamber,
        participationRate: { gt: entry.participationRate },
      },
    }),
    db.politicianParticipation.count({ where: { chamber } }),
  ]);

  return {
    chamber,
    mandateType,
    votesCount: entry.votesCount,
    eligibleScrutins: entry.eligibleScrutins,
    participationRate: entry.participationRate,
    rank: higherCount + 1,
    totalPeers,
    dissidenceRate: entry.dissidenceRate,
    dissidenceCount: entry.dissidenceCount,
    dissidenceTotal: entry.dissidenceTotal,
  };
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
  const entry = await db.politicianParticipation.findUnique({
    where: { politicianId },
    select: { themeDistribution: true },
  });

  if (!entry?.themeDistribution) return [];

  const dist = entry.themeDistribution as Record<
    string,
    { pour: number; contre: number; abstention: number; total: number }
  >;

  return Object.entries(dist)
    .map(([theme, counts]) => ({
      theme,
      label: THEME_CATEGORY_LABELS[theme as ThemeCategory] || theme,
      icon: THEME_CATEGORY_ICONS[theme as ThemeCategory] || "",
      ...counts,
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
  averageParticipationPct: number;
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
    averageParticipationPct: s.averageParticipationPct,
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
