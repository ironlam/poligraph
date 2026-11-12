/**
 * Prominence score recalculation service.
 *
 * Score range: 0–1000
 * Components:
 *   mandateWeight  (0–400) — highest mandate/party-role weight, current vs past
 *   activityScore  (0–200) — votes, press mentions, fact-check mentions
 *   mediaScore     (0–150) — recent press coverage (last 3 months)
 *   affairsScore   (0–100) — judicial affairs count
 *   recencyBonus   (0–150) — bonus for currently active politicians
 */

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma";
import { getPublishedAffairWhere } from "@/lib/affairs/public-filters";
import {
  MANDATE_WEIGHTS,
  PARTY_ROLE_WEIGHTS,
  CURRENT_MANDATE_MULTIPLIER,
  PAST_MANDATE_MULTIPLIER,
  ACTIVITY_CONFIG,
  MEDIA_CONFIG,
  AFFAIRS_CONFIG,
  RECENCY_CONFIG,
  SCORE_CAPS,
} from "@/config/prominence";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProminenceOptions {
  dryRun?: boolean;
}

export interface ProminenceStats {
  totalPoliticians: number;
  updated: number;
  maxScore: number;
  averageScore: number;
}

interface PoliticianData {
  id: string;
  mandates: {
    type: string;
    isCurrent: boolean;
    endDate: Date | null;
  }[];
  partyHistory: {
    role: string;
    endDate: Date | null;
  }[];
  _count: {
    votes: number;
    pressMentions: number;
    factCheckMentions: number;
  };
}

// ---------------------------------------------------------------------------
// Score helpers
// ---------------------------------------------------------------------------

function cap(value: number, max: number): number {
  return Math.min(Math.round(value), max);
}

function calcMandateWeight(p: PoliticianData): number {
  let bestMandateScore = 0;
  for (const m of p.mandates) {
    const baseWeight = MANDATE_WEIGHTS[m.type as keyof typeof MANDATE_WEIGHTS] ?? 0;
    const multiplier = m.isCurrent ? CURRENT_MANDATE_MULTIPLIER : PAST_MANDATE_MULTIPLIER;
    const score = baseWeight * multiplier;
    if (score > bestMandateScore) bestMandateScore = score;
  }

  let bestRoleScore = 0;
  for (const pm of p.partyHistory) {
    const roleWeight = PARTY_ROLE_WEIGHTS[pm.role as keyof typeof PARTY_ROLE_WEIGHTS] ?? 0;
    const multiplier = pm.endDate === null ? CURRENT_MANDATE_MULTIPLIER : PAST_MANDATE_MULTIPLIER;
    const score = roleWeight * multiplier;
    if (score > bestRoleScore) bestRoleScore = score;
  }

  return cap(Math.max(bestMandateScore, bestRoleScore), SCORE_CAPS.mandate);
}

function calcActivityScore(p: PoliticianData): number {
  const votePoints = cap(
    p._count.votes * ACTIVITY_CONFIG.pointsPerVote,
    ACTIVITY_CONFIG.maxVotePoints
  );
  const pressPoints = cap(
    p._count.pressMentions * ACTIVITY_CONFIG.pointsPerPressMention,
    ACTIVITY_CONFIG.maxPressPoints
  );
  const factCheckPoints = cap(
    p._count.factCheckMentions * ACTIVITY_CONFIG.pointsPerFactCheck,
    ACTIVITY_CONFIG.maxFactCheckPoints
  );

  return cap(votePoints + pressPoints + factCheckPoints, SCORE_CAPS.activity);
}

function calcMediaScore(recentMentionCount: number): number {
  return cap(recentMentionCount * MEDIA_CONFIG.pointsPerRecentMention, SCORE_CAPS.media);
}

function calcAffairsScore(severityCounts: Record<string, number>): number {
  let total = 0;
  for (const [severity, count] of Object.entries(severityCounts)) {
    const points = AFFAIRS_CONFIG.pointsBySeverity[severity] ?? 5;
    total += count * points;
  }
  return cap(total, SCORE_CAPS.affairs);
}

function calcRecencyBonus(p: PoliticianData): number {
  const hasCurrentMandate = p.mandates.some((m) => m.isCurrent);
  if (hasCurrentMandate) return RECENCY_CONFIG.currentMandateBonus;

  const hasActiveRole = p.partyHistory.some((pm) => pm.role !== "MEMBRE" && pm.endDate === null);
  if (hasActiveRole) return RECENCY_CONFIG.activePartyRoleBonus;

  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
  const recentlyEnded = p.mandates.some(
    (m) => !m.isCurrent && m.endDate && m.endDate >= fiveYearsAgo
  );
  if (recentlyEnded) return RECENCY_CONFIG.recentlyActiveBonus;

  return 0;
}

// ---------------------------------------------------------------------------
// Main service
// ---------------------------------------------------------------------------

async function queryProminenceScores(
  politicianIds?: string[]
): Promise<{ id: string; score: number }[]> {
  const politicianScope = politicianIds ? { in: politicianIds } : undefined;
  const politicians = await db.politician.findMany({
    where: politicianScope ? { id: politicianScope } : undefined,
    select: {
      id: true,
      mandates: {
        select: { type: true, isCurrent: true, endDate: true },
      },
      partyHistory: {
        select: { role: true, endDate: true },
      },
      _count: {
        select: {
          votes: true,
          pressMentions: true,
          factCheckMentions: true,
        },
      },
    },
  });

  // 2. Fetch recent press mention counts
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - MEDIA_CONFIG.recentMonths);

  const [recentMentions, affairsBySeverity] = await Promise.all([
    db.pressArticleMention.groupBy({
      by: ["politicianId"],
      where: {
        politicianId: politicianScope,
        article: { publishedAt: { gte: threeMonthsAgo } },
      },
      _count: { politicianId: true },
    }),
    db.affair.groupBy({
      by: ["politicianId", "severity"],
      where: { ...getPublishedAffairWhere(), politicianId: politicianScope, involvement: "DIRECT" },
      _count: true,
    }),
  ]);

  const recentMentionMap = new Map<string, number>();
  for (const r of recentMentions) {
    recentMentionMap.set(r.politicianId, r._count.politicianId);
  }

  // Build severity counts per politician
  const affairSeverityMap = new Map<string, Record<string, number>>();
  for (const row of affairsBySeverity) {
    const existing = affairSeverityMap.get(row.politicianId) || {};
    existing[row.severity] = row._count;
    affairSeverityMap.set(row.politicianId, existing);
  }

  return politicians.map((p) => {
    const mandateWeight = calcMandateWeight(p);
    const activityScore = calcActivityScore(p);
    const recentCount = recentMentionMap.get(p.id) ?? 0;
    const mediaScore = calcMediaScore(recentCount);
    const severityCounts = affairSeverityMap.get(p.id) || {};
    const affairsScore = calcAffairsScore(severityCounts);
    const recencyBonus = calcRecencyBonus(p);

    const total = cap(
      mandateWeight + activityScore + mediaScore + affairsScore + recencyBonus,
      SCORE_CAPS.total
    );

    return { id: p.id, score: total };
  });
}

/** The public CSV needs a current score, including only affairs still published at read time. */
export async function getExportProminenceScores(
  politicianIds: string[]
): Promise<Map<string, number>> {
  const scores = new Map<string, number>();
  // Keep the ID filter below PostgreSQL's parameter limit, including for a full 50k-row CSV.
  const batchSize = 10000;
  for (let start = 0; start < politicianIds.length; start += batchSize) {
    const batch = await queryProminenceScores(politicianIds.slice(start, start + batchSize));
    for (const { id, score } of batch) scores.set(id, score);
  }
  return scores;
}

export async function recalculateProminence(
  options: ProminenceOptions = {}
): Promise<ProminenceStats> {
  const { dryRun = false } = options;
  const updates = await queryProminenceScores();

  // 4. Batch update using parameterized raw SQL (avoids Prisma transaction timeout on serverless)
  if (!dryRun) {
    const CHUNK_SIZE = 500;
    for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
      const chunk = updates.slice(i, i + CHUNK_SIZE);
      // Politician.id is cuid (TEXT), not UUID. Casting to ::uuid breaks the
      // join in adapter-pg (error 42883: operator does not exist: text = uuid).
      const values = Prisma.join(chunk.map((u) => Prisma.sql`(${u.id}, ${u.score}::int)`));
      await db.$executeRaw`UPDATE "Politician" p SET "prominenceScore" = c.score::int FROM (VALUES ${values}) AS c(id, score) WHERE p.id = c.id`;
    }
  }

  const scores = updates.map((u) => u.score);

  return {
    totalPoliticians: updates.length,
    updated: dryRun ? 0 : updates.length,
    maxScore: scores.length > 0 ? Math.max(...scores) : 0,
    averageScore:
      scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
  };
}
