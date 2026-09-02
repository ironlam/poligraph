import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma";
import { VERDICT_GROUPS } from "@/config/labels";
import { bayesianScore } from "@/lib/bayesianScore";
import { getPublicFactCheckSqlWhere, getPublicFactCheckWhere } from "@/lib/api/public-contract";

// ============================================
// Types
// ============================================

export interface FactCheckStatsResult {
  global: {
    totalFactChecks: number;
    byVerdict: Record<string, number>;
  };
  byParty: Array<{
    partyId: string;
    partyName: string;
    partyShortName: string;
    partyColor: string | null;
    partySlug: string | null;
    totalMentions: number;
    byVerdict: Record<string, number>;
  }>;
  byPolitician: Array<{
    politicianId: string;
    fullName: string;
    slug: string;
    partyShortName: string | null;
    totalMentions: number;
    byVerdict: Record<string, number>;
  }>;
  bySource: Array<{
    source: string;
    total: number;
    byVerdict: Record<string, number>;
  }>;
}

/** Shape returned by getPageStats() — consumed by factchecks/page.tsx */
export interface FactCheckPageStats {
  totalFactChecks: number;
  byRating: Record<string, number>;
  bySource: Array<{ source: string; count: number }>;
  topPoliticians: Array<{ fullName: string; slug: string; count: bigint }>;
}

/** Verdict breakdown used in statistics rankings */
export interface VerdictBreakdown {
  vrai: number;
  trompeur: number;
  faux: number;
  inverifiable: number;
}

export interface RankedPolitician {
  fullName: string;
  slug: string;
  photoUrl: string | null;
  party: string | null;
  partyColor: string | null;
  totalMentions: number;
  breakdown: VerdictBreakdown;
  scoreVrai: number;
  scoreFaux: number;
}

export interface RankedParty {
  name: string;
  shortName: string | null;
  color: string | null;
  slug: string | null;
  totalMentions: number;
  breakdown: VerdictBreakdown;
  scoreVrai: number;
  scoreFaux: number;
}

/**
 * Shape returned by getStatisticsData(), consumed by statistiques/page.tsx.
 *
 * Doctrine éditoriale (issue #727) : ces classements décrivent la
 * répartition des verdicts sur un corpus d'affirmations attribuées, pas la
 * fiabilité générale d'une personne ou d'un parti. D'où des noms de champs
 * et des libellés descriptifs ("part de vrai/faux") plutôt que normatifs
 * ("le/la plus fiable").
 *
 * Unité comptée : uniquement les mentions où le responsable politique est
 * l'auteur direct de l'affirmation (`isClaimant = true`), pas une simple
 * mention. L'affiliation partisane utilisée est l'affiliation actuelle du
 * responsable (`currentPartyId`), pas nécessairement celle au moment de
 * l'affirmation.
 */
export interface FactCheckStatisticsData {
  total: number;
  groups: VerdictBreakdown;
  bySource: Array<{ source: string; count: number }>;
  topVraiSharePoliticians: RankedPolitician[];
  topFauxSharePoliticians: RankedPolitician[];
  topVraiShareParties: RankedParty[];
  topFauxShareParties: RankedParty[];
}

// ============================================
// Service
// ============================================

/** Full stats used by the public API (/api/factchecks/stats). */
async function getFactCheckStats(options?: { limit?: number }): Promise<FactCheckStatsResult> {
  const limit = options?.limit ?? 15;

  const [globalRows, partyRows, politicianRows, sourceRows] = await Promise.all([
    getGlobalByVerdict(),
    getByParty(),
    getByPolitician(limit),
    getBySource(),
  ]);

  let totalFactChecks = 0;
  const globalByVerdict: Record<string, number> = {};
  for (const row of globalRows) {
    const count = Number(row.count);
    totalFactChecks += count;
    if (row.verdictRating) {
      globalByVerdict[row.verdictRating] = count;
    }
  }

  const byParty = aggregateByParty(partyRows, limit);
  const byPolitician = aggregateByPolitician(politicianRows);
  const bySource = aggregateBySource(sourceRows);

  return {
    global: { totalFactChecks, byVerdict: globalByVerdict },
    byParty,
    byPolitician,
    bySource,
  };
}

/**
 * Lightweight stats for factchecks/page.tsx listing page.
 * Every query uses exactly the public fact-check and public-politician boundary.
 */
async function getPageStats(): Promise<FactCheckPageStats> {
  const publicWhere = getPublicFactCheckWhere();

  const [totalFactChecks, byRatingRaw, bySourceRaw, topPoliticians] = await Promise.all([
    db.factCheck.count({ where: publicWhere }),
    db.factCheck.groupBy({
      by: ["verdictRating"],
      where: publicWhere,
      _count: true,
      orderBy: { _count: { verdictRating: "desc" } },
    }),
    db.factCheck.groupBy({
      by: ["source"],
      where: publicWhere,
      _count: true,
      orderBy: { _count: { source: "desc" } },
    }),
    db.$queryRaw<Array<{ fullName: string; slug: string; count: bigint }>>(Prisma.sql`
      SELECT p."fullName", p.slug, COUNT(*) as count
      FROM "FactCheckMention" m
      JOIN "FactCheck" fc ON m."factCheckId" = fc.id
      JOIN "Politician" p ON m."politicianId" = p.id
      WHERE ${getPublicFactCheckSqlWhere()}
        AND p."publicationStatus" = 'PUBLISHED'
      GROUP BY p.id, p."fullName", p.slug
      ORDER BY count DESC
      LIMIT 10
    `),
  ]);

  const byRating = byRatingRaw.reduce(
    (acc, r) => {
      acc[r.verdictRating] = r._count;
      return acc;
    },
    {} as Record<string, number>
  );

  return {
    totalFactChecks,
    byRating,
    bySource: bySourceRaw.map((s) => ({ source: s.source, count: s._count })),
    topPoliticians,
  };
}

/** Minimum fact-check mentions required to include a politician/party in rankings */
const MIN_MENTIONS = 5;

/**
 * Classe un `verdictRating` dans une des quatre catégories connues.
 *
 * `UNVERIFIABLE` est un verdict éditorial explicite ("l'affirmation ne peut
 * être vérifiée"), pas une valeur par défaut. Un code non reconnu (futur
 * enum Prisma non encore mappé ici) doit donc renvoyer `null` plutôt que
 * d'être assimilé à `inverifiable` : inconnu ≠ invérifiable. Les appelants
 * doivent exclure les `null` des agrégats plutôt que de les compter.
 */
export function classifyRating(rating: string): keyof VerdictBreakdown | null {
  if ((VERDICT_GROUPS.vrai as readonly string[]).includes(rating)) return "vrai";
  if ((VERDICT_GROUPS.trompeur as readonly string[]).includes(rating)) return "trompeur";
  if ((VERDICT_GROUPS.faux as readonly string[]).includes(rating)) return "faux";
  if ((VERDICT_GROUPS.inverifiable as readonly string[]).includes(rating)) return "inverifiable";
  return null;
}

/**
 * Rich statistics for statistiques/page.tsx.
 * Only published fact-checks from allowed sources and published politicians may
 * contribute to public rankings.
 */
async function getStatisticsData(): Promise<FactCheckStatisticsData> {
  const publicWhere = getPublicFactCheckWhere();

  const [total, byRatingRaw, bySourceRaw, allMentions] = await Promise.all([
    db.factCheck.count({ where: publicWhere }),
    db.factCheck.groupBy({
      by: ["verdictRating"],
      where: publicWhere,
      _count: true,
      orderBy: { _count: { verdictRating: "desc" } },
    }),
    db.factCheck.groupBy({
      by: ["source"],
      where: publicWhere,
      _count: true,
      orderBy: { _count: { source: "desc" } },
    }),
    db.$queryRaw<
      Array<{
        politicianId: string;
        fullName: string;
        slug: string;
        photoUrl: string | null;
        partyName: string | null;
        partyShortName: string | null;
        partyColor: string | null;
        partySlug: string | null;
        verdictRating: string;
        mentionCount: bigint;
      }>
    >(Prisma.sql`
      SELECT
        p.id AS "politicianId",
        p."fullName",
        p.slug,
        p."photoUrl",
        party.name AS "partyName",
        party."shortName" AS "partyShortName",
        party.color AS "partyColor",
        party.slug AS "partySlug",
        fc."verdictRating",
        COUNT(*)::bigint AS "mentionCount"
      FROM "FactCheckMention" fcm
      JOIN "FactCheck" fc ON fcm."factCheckId" = fc.id
      JOIN "Politician" p ON fcm."politicianId" = p.id
      LEFT JOIN "Party" party ON p."currentPartyId" = party.id
      WHERE fcm."isClaimant" = true
        AND ${getPublicFactCheckSqlWhere()}
        AND p."publicationStatus" = 'PUBLISHED'
      GROUP BY p.id, p."fullName", p.slug, p."photoUrl",
               party.name, party."shortName", party.color, party.slug,
               fc."verdictRating"
    `),
  ]);

  const ratingMap: Record<string, number> = {};
  byRatingRaw.forEach((r) => {
    ratingMap[r.verdictRating] = r._count;
  });

  const groups: VerdictBreakdown = {
    vrai: VERDICT_GROUPS.vrai.reduce((sum, r) => sum + (ratingMap[r] || 0), 0),
    trompeur: VERDICT_GROUPS.trompeur.reduce((sum, r) => sum + (ratingMap[r] || 0), 0),
    faux: VERDICT_GROUPS.faux.reduce((sum, r) => sum + (ratingMap[r] || 0), 0),
    inverifiable: VERDICT_GROUPS.inverifiable.reduce((sum, r) => sum + (ratingMap[r] || 0), 0),
  };

  const politicianMap = new Map<
    string,
    {
      fullName: string;
      slug: string;
      photoUrl: string | null;
      party: string | null;
      partyColor: string | null;
      breakdown: VerdictBreakdown;
      total: number;
    }
  >();
  const partyMap = new Map<
    string,
    {
      name: string;
      shortName: string | null;
      color: string | null;
      slug: string | null;
      breakdown: VerdictBreakdown;
      total: number;
    }
  >();

  for (const row of allMentions) {
    const count = Number(row.mentionCount);
    const verdict = classifyRating(row.verdictRating);
    if (!verdict) {
      // Code de verdict non reconnu : exclu des classements plutôt que
      // rattaché à "inverifiable" par défaut (voir classifyRating()).
      console.warn(`[factcheckStats] verdictRating inconnu ignoré: ${row.verdictRating}`);
      continue;
    }
    const partyKey = row.partySlug;
    const partyDisplayName = row.partyName || row.partyShortName;

    if (!politicianMap.has(row.politicianId)) {
      politicianMap.set(row.politicianId, {
        fullName: row.fullName,
        slug: row.slug,
        photoUrl: row.photoUrl,
        party: partyDisplayName,
        partyColor: row.partyColor,
        breakdown: { vrai: 0, trompeur: 0, faux: 0, inverifiable: 0 },
        total: 0,
      });
    }
    const polEntry = politicianMap.get(row.politicianId)!;
    polEntry.breakdown[verdict] += count;
    polEntry.total += count;

    if (partyKey) {
      if (!partyMap.has(partyKey)) {
        partyMap.set(partyKey, {
          name: partyDisplayName!,
          shortName: row.partyShortName,
          color: row.partyColor,
          slug: row.partySlug,
          breakdown: { vrai: 0, trompeur: 0, faux: 0, inverifiable: 0 },
          total: 0,
        });
      }
      const partyEntry = partyMap.get(partyKey)!;
      partyEntry.breakdown[verdict] += count;
      partyEntry.total += count;
    }
  }

  const allPols = [...politicianMap.values()].filter((p) => p.total >= MIN_MENTIONS);
  const totalScorable = allPols.reduce((sum, p) => sum + p.total - p.breakdown.inverifiable, 0);
  const totalVrai = allPols.reduce((sum, p) => sum + p.breakdown.vrai, 0);
  const totalFaux = allPols.reduce((sum, p) => sum + p.breakdown.faux, 0);
  const globalMeanVrai = totalScorable > 0 ? totalVrai / totalScorable : 0;
  const globalMeanFaux = totalScorable > 0 ? totalFaux / totalScorable : 0;

  const scorePolitician = (p: (typeof allPols)[number]): RankedPolitician => {
    const scorable = p.total - p.breakdown.inverifiable;
    const pVrai = scorable > 0 ? p.breakdown.vrai / scorable : 0;
    const pFaux = scorable > 0 ? p.breakdown.faux / scorable : 0;
    return {
      fullName: p.fullName,
      slug: p.slug,
      photoUrl: p.photoUrl,
      party: p.party,
      partyColor: p.partyColor,
      totalMentions: p.total,
      breakdown: p.breakdown,
      scoreVrai: bayesianScore(pVrai, scorable, globalMeanVrai),
      scoreFaux: bayesianScore(pFaux, scorable, globalMeanFaux),
    };
  };

  // Chaque classement est calculé indépendamment sur l'ensemble éligible complet :
  // un même responsable peut apparaître dans les deux s'il a un score élevé sur
  // les deux métriques (score = part de vrai/faux pondérée, pas un pourcentage
  // brut), notamment quand "trompeur" représente une large part de son corpus.
  const rankedPoliticians = allPols.map(scorePolitician);
  const topVraiSharePoliticians = [...rankedPoliticians]
    .sort((a, b) => b.scoreVrai - a.scoreVrai)
    .slice(0, 5);
  const topFauxSharePoliticians = [...rankedPoliticians]
    .sort((a, b) => b.scoreFaux - a.scoreFaux)
    .slice(0, 5);

  const allParties = [...partyMap.values()].filter((p) => p.total >= MIN_MENTIONS);
  const partyTotalScorable = allParties.reduce(
    (sum, p) => sum + p.total - p.breakdown.inverifiable,
    0
  );
  const partyTotalVrai = allParties.reduce((sum, p) => sum + p.breakdown.vrai, 0);
  const partyTotalFaux = allParties.reduce((sum, p) => sum + p.breakdown.faux, 0);
  const partyGlobalMeanVrai = partyTotalScorable > 0 ? partyTotalVrai / partyTotalScorable : 0;
  const partyGlobalMeanFaux = partyTotalScorable > 0 ? partyTotalFaux / partyTotalScorable : 0;

  const scoreParty = (p: (typeof allParties)[number]): RankedParty => {
    const scorable = p.total - p.breakdown.inverifiable;
    const pVrai = scorable > 0 ? p.breakdown.vrai / scorable : 0;
    const pFaux = scorable > 0 ? p.breakdown.faux / scorable : 0;
    return {
      name: p.name,
      shortName: p.shortName,
      color: p.color,
      slug: p.slug,
      totalMentions: p.total,
      breakdown: p.breakdown,
      scoreVrai: bayesianScore(pVrai, scorable, partyGlobalMeanVrai),
      scoreFaux: bayesianScore(pFaux, scorable, partyGlobalMeanFaux),
    };
  };

  const rankedParties = allParties.map(scoreParty);
  const topVraiShareParties = [...rankedParties]
    .sort((a, b) => b.scoreVrai - a.scoreVrai)
    .slice(0, 5);
  const topFauxShareParties = [...rankedParties]
    .sort((a, b) => b.scoreFaux - a.scoreFaux)
    .slice(0, 5);

  return {
    total,
    groups,
    bySource: bySourceRaw.map((s) => ({ source: s.source, count: s._count })),
    topVraiSharePoliticians,
    topFauxSharePoliticians,
    topVraiShareParties,
    topFauxShareParties,
  };
}

// ============================================
// Internal queries (used by getFactCheckStats)
// ============================================

interface GlobalVerdictRow {
  verdictRating: string;
  count: bigint;
}

async function getGlobalByVerdict(): Promise<GlobalVerdictRow[]> {
  return db.$queryRaw<GlobalVerdictRow[]>(Prisma.sql`
    SELECT fc."verdictRating", COUNT(*) as count
    FROM "FactCheck" fc
    WHERE ${getPublicFactCheckSqlWhere()}
    GROUP BY fc."verdictRating"
  `);
}

interface PartyVerdictRow {
  partyId: string;
  partyName: string;
  partyShortName: string;
  partyColor: string | null;
  partySlug: string | null;
  verdictRating: string;
  count: bigint;
}

async function getByParty(): Promise<PartyVerdictRow[]> {
  return db.$queryRaw<PartyVerdictRow[]>(Prisma.sql`
    SELECT
      p.id as "partyId",
      p.name as "partyName",
      p."shortName" as "partyShortName",
      p.color as "partyColor",
      p.slug as "partySlug",
      fc."verdictRating",
      COUNT(*) as count
    FROM "FactCheckMention" fcm
    JOIN "FactCheck" fc ON fcm."factCheckId" = fc.id
    JOIN "Politician" pol ON fcm."politicianId" = pol.id
    JOIN "Party" p ON pol."currentPartyId" = p.id
    WHERE ${getPublicFactCheckSqlWhere()}
      AND pol."publicationStatus" = 'PUBLISHED'
    GROUP BY p.id, p.name, p."shortName", p.color, p.slug, fc."verdictRating"
    ORDER BY COUNT(*) DESC
  `);
}

interface PoliticianVerdictRow {
  politicianId: string;
  fullName: string;
  slug: string;
  partyShortName: string | null;
  verdictRating: string;
  count: bigint;
}

async function getByPolitician(limit: number): Promise<PoliticianVerdictRow[]> {
  return db.$queryRaw<PoliticianVerdictRow[]>(Prisma.sql`
    SELECT
      sub."politicianId",
      sub."fullName",
      sub.slug,
      sub."partyShortName",
      fc."verdictRating",
      COUNT(*) as count
    FROM (
      SELECT DISTINCT pol.id as "politicianId", pol."fullName", pol.slug,
        p."shortName" as "partyShortName", fcm."factCheckId"
      FROM "FactCheckMention" fcm
      JOIN "Politician" pol ON fcm."politicianId" = pol.id
      LEFT JOIN "Party" p ON pol."currentPartyId" = p.id
      WHERE pol."publicationStatus" = 'PUBLISHED'
    ) sub
    JOIN "FactCheck" fc ON sub."factCheckId" = fc.id
    WHERE ${getPublicFactCheckSqlWhere()}
      AND sub."politicianId" IN (
        SELECT fcm2."politicianId"
        FROM "FactCheckMention" fcm2
        JOIN "FactCheck" fc2 ON fcm2."factCheckId" = fc2.id
        JOIN "Politician" pol2 ON fcm2."politicianId" = pol2.id
        WHERE ${getPublicFactCheckSqlWhere("fc2")}
          AND pol2."publicationStatus" = 'PUBLISHED'
        GROUP BY fcm2."politicianId"
        ORDER BY COUNT(*) DESC
        LIMIT ${limit}
      )
    GROUP BY sub."politicianId", sub."fullName", sub.slug, sub."partyShortName", fc."verdictRating"
  `);
}

interface SourceVerdictRow {
  source: string;
  verdictRating: string;
  count: bigint;
}

async function getBySource(): Promise<SourceVerdictRow[]> {
  return db.$queryRaw<SourceVerdictRow[]>(Prisma.sql`
    SELECT fc.source, fc."verdictRating", COUNT(*) as count
    FROM "FactCheck" fc
    WHERE ${getPublicFactCheckSqlWhere()}
    GROUP BY fc.source, fc."verdictRating"
    ORDER BY COUNT(*) DESC
  `);
}

// ============================================
// Aggregation helpers
// ============================================

function aggregateByParty(rows: PartyVerdictRow[], limit: number) {
  const map = new Map<
    string,
    {
      partyId: string;
      partyName: string;
      partyShortName: string;
      partyColor: string | null;
      partySlug: string | null;
      totalMentions: number;
      byVerdict: Record<string, number>;
    }
  >();

  for (const row of rows) {
    if (!map.has(row.partyId)) {
      map.set(row.partyId, {
        partyId: row.partyId,
        partyName: row.partyName,
        partyShortName: row.partyShortName,
        partyColor: row.partyColor,
        partySlug: row.partySlug,
        totalMentions: 0,
        byVerdict: {},
      });
    }
    const entry = map.get(row.partyId)!;
    const count = Number(row.count);
    entry.totalMentions += count;
    if (row.verdictRating) {
      entry.byVerdict[row.verdictRating] = count;
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.totalMentions - a.totalMentions)
    .slice(0, limit);
}

function aggregateByPolitician(rows: PoliticianVerdictRow[]) {
  const map = new Map<
    string,
    {
      politicianId: string;
      fullName: string;
      slug: string;
      partyShortName: string | null;
      totalMentions: number;
      byVerdict: Record<string, number>;
    }
  >();

  for (const row of rows) {
    if (!map.has(row.politicianId)) {
      map.set(row.politicianId, {
        politicianId: row.politicianId,
        fullName: row.fullName,
        slug: row.slug,
        partyShortName: row.partyShortName,
        totalMentions: 0,
        byVerdict: {},
      });
    }
    const entry = map.get(row.politicianId)!;
    const count = Number(row.count);
    entry.totalMentions += count;
    if (row.verdictRating) {
      entry.byVerdict[row.verdictRating] = count;
    }
  }

  return Array.from(map.values()).sort((a, b) => b.totalMentions - a.totalMentions);
}

function aggregateBySource(rows: SourceVerdictRow[]) {
  const map = new Map<
    string,
    {
      source: string;
      total: number;
      byVerdict: Record<string, number>;
    }
  >();

  for (const row of rows) {
    if (!map.has(row.source)) {
      map.set(row.source, {
        source: row.source,
        total: 0,
        byVerdict: {},
      });
    }
    const entry = map.get(row.source)!;
    const count = Number(row.count);
    entry.total += count;
    if (row.verdictRating) {
      entry.byVerdict[row.verdictRating] = count;
    }
  }

  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

// ============================================
// Export
// ============================================

export const factcheckStatsService = {
  getFactCheckStats,
  getPageStats,
  getStatisticsData,
};
