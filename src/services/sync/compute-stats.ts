/**
 * Pre-compute participation statistics for the /statistiques page.
 *
 * Replaces expensive real-time CTE+LATERAL queries (~20s) with pre-computed
 * tables that serve instantly (<100ms).
 *
 * Methodology (Assemblée nationale only):
 *   participation = (votes cast during mandate) / (eligible scrutins during mandate) × 100
 *   - "eligible scrutins" = scrutins in the correct chamber between mandate startDate and endDate
 *   - "votes cast" = Vote records for the politician on eligible scrutins
 * Senate participation is deliberately excluded: its vote rows do not provide a reliable
 * individual-presence denominator.
 *
 * Tables populated:
 *   - PoliticianParticipation: per-politician stats for ranking/pagination
 *   - StatsSnapshot: aggregated stats (party/group participation averages)
 */

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma";
import type { Chamber, ThemeCategory } from "@/generated/prisma";
import { THEME_CATEGORY_LABELS, THEME_CATEGORY_ICONS } from "@/config/labels";
import {
  PARTICIPATION_METHOD_VERSION,
  resolveCurrentParliamentaryMandate,
  roundParticipationRate,
} from "@/lib/votes/participation-publication";
import {
  findGroupMajority,
  computePoliticianDissidence,
  aggregateDissidenceByGroup,
  CURRENT_GROUP_VOTES_FROM,
  type GroupVoteEntry,
  type PoliticianVoteWithGroup,
} from "./dissidence";

// ============================================
// Types
// ============================================

interface PoliticianRow {
  politicianId: string;
  firstName: string;
  lastName: string;
  slug: string;
  photoUrl: string | null;
  partyId: string | null;
  partyShortName: string | null;
  partyColor: string | null;
  partySlug: string | null;
  groupId: string | null;
  groupCode: string | null;
  groupName: string | null;
  groupColor: string | null;
  mandateType: string;
  chamber: Chamber;
  votesCount: number;
  eligibleScrutins: number;
  participationRate: number;
  computationVersion: string;
}

type RawPoliticianRow = Omit<PoliticianRow, "participationRate" | "computationVersion">;

interface CurrentParliamentaryMandateRow {
  politicianId: string;
  type: "DEPUTE" | "SENATEUR";
  startDate: Date;
  endDate: Date | null;
}

interface PartyAggRow {
  partyId: string;
  partyName: string;
  partyShortName: string;
  partyColor: string | null;
  partySlug: string | null;
  avgParticipationRate: number;
  memberCount: number;
  computationVersion: string;
}

interface GroupAggRow {
  groupId: string;
  groupName: string;
  groupCode: string;
  groupColor: string | null;
  groupChamber: string;
  avgParticipationRate: number;
  memberCount: number;
  computationVersion: string;
}

interface ThemeDistributionRow {
  theme: string;
  label: string;
  icon: string;
  count: number;
}

interface PipelineRow {
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

interface LegislativeKpi {
  scrutinsAnalyses: number;
  dossiersEnDiscussion: number;
  textesAdoptes: number;
}

interface DissidenceRow {
  politicianId: string;
  dissidenceCount: number;
  dissidenceTotal: number;
  dissidenceRate: number;
}

interface DissidencePoliticianRow {
  politicianId: string;
  groupId: string | null;
  groupCode: string | null;
  groupName: string | null;
  groupColor: string | null;
  groupChamber: Chamber;
}

interface ThemeVoteRow {
  politicianId: string;
  theme: string;
  pour: number;
  contre: number;
  abstention: number;
  total: number;
}

interface KeyVoteRow {
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

export interface ComputeStatsResult {
  politicians: number;
  parties: number;
  groups: number;
  durationMs: number;
}

// ============================================
// Core computation
// ============================================

/**
 * Compute participation only for an unambiguous current parliamentary mandate.
 *
 * Strategy:
 * 1. Pre-compute eligible scrutins per unique (startDate, endDate, type) group (~20 groups)
 * 2. For each politician, count votes via LATERAL subquery using indexes
 * 3. Return all rows with denormalized display fields
 */
export async function computePoliticianParticipation(verbose = false): Promise<PoliticianRow[]> {
  if (verbose) console.log("  Computing per-politician participation...");

  const [rawRows, currentMandates] = await Promise.all([
    db.$queryRaw<RawPoliticianRow[]>`
    WITH current_parliamentary_scope AS (
      SELECT m."politicianId"
      FROM "Mandate" m
      WHERE m."isCurrent" = true
        AND m.type IN ('DEPUTE'::"MandateType", 'SENATEUR'::"MandateType")
      GROUP BY m."politicianId"
      HAVING COUNT(*) = 1
        AND COUNT(*) FILTER (WHERE m.type = 'DEPUTE'::"MandateType") = 1
    ), mandate_eligible AS (
      SELECT
        md."startDate", md."endDate", md.type,
        'AN'::"Chamber" as chamber,
        (SELECT COUNT(*) FROM "Scrutin" s
         WHERE s.chamber = 'AN'::"Chamber"
           AND s."votingDate" >= md."startDate"
           AND (md."endDate" IS NULL OR s."votingDate" <= md."endDate"))::int as eligible
      FROM (
        SELECT DISTINCT m."startDate", m."endDate", m.type
        FROM "Mandate" m
        JOIN current_parliamentary_scope cps ON cps."politicianId" = m."politicianId"
        WHERE m."isCurrent" = true
          AND m.type = 'DEPUTE'::"MandateType"
      ) md
    )
    SELECT
      pol.id as "politicianId",
      pol."firstName",
      pol."lastName",
      pol.slug,
      COALESCE(pol."blobPhotoUrl", pol."photoUrl") as "photoUrl",
      pol."currentPartyId" as "partyId",
      p."shortName" as "partyShortName",
      p.color as "partyColor",
      p.slug as "partySlug",
      pg.id as "groupId",
      pg.code as "groupCode",
      pg.name as "groupName",
      pg.color as "groupColor",
      m.type::text as "mandateType",
      me.chamber,
      vote_sub.expressed as "votesCount",
      me.eligible as "eligibleScrutins"
    FROM "Politician" pol
    JOIN current_parliamentary_scope cps ON cps."politicianId" = pol.id
    JOIN "Mandate" m ON m."politicianId" = pol.id AND m."isCurrent" = true
      AND m.type = 'DEPUTE'::"MandateType"
    JOIN mandate_eligible me ON me."startDate" = m."startDate"
      AND ((me."endDate" IS NULL AND m."endDate" IS NULL) OR me."endDate" = m."endDate")
      AND me.type = m.type
    CROSS JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE v.position IN ('POUR', 'CONTRE', 'ABSTENTION'))::int as expressed
      FROM "Vote" v
      WHERE v."politicianId" = pol.id
        AND v.chamber = me.chamber
        AND v."votingDate" >= m."startDate"
        AND (m."endDate" IS NULL OR v."votingDate" <= m."endDate")
    ) vote_sub
    LEFT JOIN "Party" p ON p.id = pol."currentPartyId"
    LEFT JOIN "MandateParliamentary" mp ON mp."mandateId" = m.id
    LEFT JOIN "ParliamentaryGroup" pg ON pg.id = mp."parliamentaryGroupId"
    WHERE pol."publicationStatus" = 'PUBLISHED'
      AND me.eligible > 0
  `,
    db.mandate.findMany({
      where: {
        isCurrent: true,
        type: { in: ["DEPUTE", "SENATEUR"] },
      },
      select: {
        politicianId: true,
        type: true,
        startDate: true,
        endDate: true,
      },
    }) as Promise<CurrentParliamentaryMandateRow[]>,
  ]);

  // Defense in depth and a testable mirror of the SQL cardinality guard. The SQL
  // already excludes ambiguous rows; this filter prevents a future query edit from
  // silently turning duplicate or cross-chamber mandates into publishable data.
  const mandatesByPolitician = new Map<string, CurrentParliamentaryMandateRow[]>();
  for (const mandate of currentMandates) {
    const mandates = mandatesByPolitician.get(mandate.politicianId) ?? [];
    mandates.push(mandate);
    mandatesByPolitician.set(mandate.politicianId, mandates);
  }

  const rows = rawRows
    .filter((row) => {
      const resolution = resolveCurrentParliamentaryMandate(
        mandatesByPolitician.get(row.politicianId) ?? []
      );
      return resolution.applicableMandate?.type === "DEPUTE";
    })
    .map((row) => ({
      ...row,
      participationRate: roundParticipationRate(row.votesCount, row.eligibleScrutins),
      computationVersion: PARTICIPATION_METHOD_VERSION,
    }));

  if (verbose) console.log(`  → ${rows.length} politicians computed`);
  return rows;
}

async function computeDissidenceData(verbose = false): Promise<Map<string, DissidenceRow>> {
  if (verbose) console.log("  Computing dissidence rates...");

  // Refresh "Vote"'s visibility map so the two aggregations below stay on an
  // Index Only Scan (otherwise they fall back to the heap, ~1.5M fetches).
  // Non-blocking: a maintenance failure must not kill the stats computation.
  try {
    await db.$executeRaw(Prisma.sql`VACUUM (ANALYZE) "Vote"`);
  } catch (error) {
    if (verbose) console.warn(`  VACUUM "Vote" skipped: ${error}`);
  }

  const groupVoteCounts = await db.$queryRaw<GroupVoteEntry[]>`
    SELECT
      v."scrutinId" as "scrutinId",
      mp."parliamentaryGroupId" as "groupId",
      v.position,
      COUNT(*)::int as count
    ${CURRENT_GROUP_VOTES_FROM}
    GROUP BY v."scrutinId", mp."parliamentaryGroupId", v.position
  `;

  const groupMajority = findGroupMajority(groupVoteCounts);
  if (verbose) console.log(`  → ${groupMajority.size} scrutin-group majority positions`);

  const politicianVotes = await db.$queryRaw<PoliticianVoteWithGroup[]>`
    SELECT
      v."politicianId" as "politicianId",
      v."scrutinId" as "scrutinId",
      mp."parliamentaryGroupId" as "groupId",
      v.position
    ${CURRENT_GROUP_VOTES_FROM}
  `;

  const dissidenceMap = computePoliticianDissidence(politicianVotes, groupMajority);
  if (verbose) console.log(`  → ${dissidenceMap.size} politicians with dissidence data`);

  const result = new Map<string, DissidenceRow>();
  for (const [id, d] of dissidenceMap) {
    result.set(id, { politicianId: id, ...d });
  }
  return result;
}

async function getDissidencePoliticians(): Promise<DissidencePoliticianRow[]> {
  return db.$queryRaw<DissidencePoliticianRow[]>`
    SELECT
      pol.id as "politicianId",
      pg.id as "groupId",
      pg.code as "groupCode",
      pg.name as "groupName",
      pg.color as "groupColor",
      pg.chamber as "groupChamber"
    FROM "Politician" pol
    JOIN "Mandate" m ON m."politicianId" = pol.id
      AND m."isCurrent" = true
      AND m.type IN ('DEPUTE'::"MandateType", 'SENATEUR'::"MandateType")
    JOIN "MandateParliamentary" mp ON mp."mandateId" = m.id
    JOIN "ParliamentaryGroup" pg ON pg.id = mp."parliamentaryGroupId"
    WHERE pol."publicationStatus" = 'PUBLISHED'
  `;
}

async function computeThemeDistributionPerPolitician(
  verbose = false
): Promise<
  Map<string, Record<string, { pour: number; contre: number; abstention: number; total: number }>>
> {
  if (verbose) console.log("  Computing per-politician theme distribution...");

  const rows = await db.$queryRaw<ThemeVoteRow[]>`
    SELECT
      v."politicianId" as "politicianId",
      s.theme,
      COUNT(*) FILTER (WHERE v.position = 'POUR')::int as pour,
      COUNT(*) FILTER (WHERE v.position = 'CONTRE')::int as contre,
      COUNT(*) FILTER (WHERE v.position = 'ABSTENTION')::int as abstention,
      COUNT(*)::int as total
    FROM "Vote" v
    JOIN "Scrutin" s ON s.id = v."scrutinId"
    WHERE s.theme IS NOT NULL
      AND v.position IN ('POUR', 'CONTRE', 'ABSTENTION')
      -- Scope votes to a current parliamentary mandate period. EXISTS (semi-join)
      -- counts each vote ONCE even when a politician has several isCurrent mandate
      -- rows whose periods both contain votingDate (e.g. an import duplicate). A
      -- plain JOIN would emit one row per matching mandate and double the counts.
      AND EXISTS (
        SELECT 1
        FROM "Mandate" m
        WHERE m."politicianId" = v."politicianId"
          AND m."isCurrent" = true
          AND m.type IN ('DEPUTE'::"MandateType", 'SENATEUR'::"MandateType")
          AND v."votingDate" >= m."startDate"
          AND (m."endDate" IS NULL OR v."votingDate" <= m."endDate")
      )
    GROUP BY v."politicianId", s.theme
  `;

  const result = new Map<
    string,
    Record<string, { pour: number; contre: number; abstention: number; total: number }>
  >();
  for (const r of rows) {
    if (!result.has(r.politicianId)) result.set(r.politicianId, {});
    result.get(r.politicianId)![r.theme] = {
      pour: r.pour,
      contre: r.contre,
      abstention: r.abstention,
      total: r.total,
    };
  }

  if (verbose) console.log(`  → ${result.size} politicians with theme data`);
  return result;
}

// ============================================
// Aggregation helpers
// ============================================

function aggregateByParty(rows: PoliticianRow[]): PartyAggRow[] {
  const partyMap = new Map<
    string,
    { rates: number[]; name: string; shortName: string; color: string | null; slug: string | null }
  >();

  for (const r of rows) {
    if (!r.partyId) continue;
    if (!partyMap.has(r.partyId)) {
      partyMap.set(r.partyId, {
        rates: [],
        name: r.partyShortName || "",
        shortName: r.partyShortName || "",
        color: r.partyColor,
        slug: r.partySlug,
      });
    }
    partyMap.get(r.partyId)!.rates.push(r.participationRate);
  }

  // We need the full party name too — fetch from DB would be cleaner,
  // but we can get it from the first politician's party
  return [...partyMap.entries()]
    .filter(([, v]) => v.rates.length >= 3)
    .map(([partyId, v]) => ({
      partyId,
      partyName: v.name,
      partyShortName: v.shortName,
      partyColor: v.color,
      partySlug: v.slug,
      avgParticipationRate:
        Math.round((v.rates.reduce((a, b) => a + b, 0) / v.rates.length) * 10) / 10,
      memberCount: v.rates.length,
      computationVersion: PARTICIPATION_METHOD_VERSION,
    }))
    .sort((a, b) => a.avgParticipationRate - b.avgParticipationRate);
}

function aggregateByGroup(rows: PoliticianRow[]): GroupAggRow[] {
  const groupMap = new Map<
    string,
    { rates: number[]; name: string; code: string; color: string | null; chamber: string }
  >();

  for (const r of rows) {
    if (!r.groupId) continue;
    if (!groupMap.has(r.groupId)) {
      groupMap.set(r.groupId, {
        rates: [],
        name: r.groupName || "",
        code: r.groupCode || "",
        color: r.groupColor,
        chamber: r.chamber,
      });
    }
    groupMap.get(r.groupId)!.rates.push(r.participationRate);
  }

  return [...groupMap.entries()]
    .filter(([, v]) => v.rates.length >= 3)
    .map(([groupId, v]) => ({
      groupId,
      groupName: v.name,
      groupCode: v.code,
      groupColor: v.color,
      groupChamber: v.chamber,
      avgParticipationRate:
        Math.round((v.rates.reduce((a, b) => a + b, 0) / v.rates.length) * 10) / 10,
      memberCount: v.rates.length,
      computationVersion: PARTICIPATION_METHOD_VERSION,
    }))
    .sort((a, b) => a.avgParticipationRate - b.avgParticipationRate);
}

// ============================================
// Persistence
// ============================================

async function upsertPoliticianParticipation(
  rows: PoliticianRow[],
  dissidenceMap: Map<string, DissidenceRow>,
  themeMap: Map<
    string,
    Record<string, { pour: number; contre: number; abstention: number; total: number }>
  >,
  dryRun: boolean,
  verbose: boolean
): Promise<void> {
  if (dryRun) {
    if (verbose)
      console.log("  [DRY RUN] Would upsert", rows.length, "PoliticianParticipation rows");
    return;
  }

  // Atomic delete+insert in a transaction to prevent readers seeing partial data
  const CHUNK_SIZE = 200;
  await db.$transaction(
    async (tx) => {
      await tx.politicianParticipation.deleteMany();

      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);
        await tx.politicianParticipation.createMany({
          data: chunk.map((r) => {
            const diss = dissidenceMap.get(r.politicianId);
            const themes = themeMap.get(r.politicianId);
            return {
              politicianId: r.politicianId,
              chamber: r.chamber,
              mandateType: r.mandateType,
              votesCount: r.votesCount,
              eligibleScrutins: r.eligibleScrutins,
              participationRate: r.participationRate,
              computationVersion: r.computationVersion,
              firstName: r.firstName,
              lastName: r.lastName,
              slug: r.slug,
              photoUrl: r.photoUrl,
              partyId: r.partyId,
              partyShortName: r.partyShortName,
              partyColor: r.partyColor,
              partySlug: r.partySlug,
              groupId: r.groupId,
              groupCode: r.groupCode,
              groupName: r.groupName,
              groupColor: r.groupColor,
              dissidenceRate: diss?.dissidenceRate ?? null,
              dissidenceCount: diss?.dissidenceCount ?? null,
              dissidenceTotal: diss?.dissidenceTotal ?? null,
              themeDistribution: themes
                ? (themes as unknown as Prisma.InputJsonValue)
                : Prisma.DbNull,
            };
          }),
        });
      }
    },
    { timeout: 60_000 }
  );

  if (verbose) console.log(`  → Inserted ${rows.length} PoliticianParticipation rows`);
}

async function upsertStatsSnapshot(
  key: string,
  data: unknown,
  durationMs: number,
  dryRun: boolean,
  verbose: boolean
): Promise<void> {
  if (dryRun) {
    if (verbose) console.log(`  [DRY RUN] Would upsert StatsSnapshot "${key}"`);
    return;
  }

  await db.statsSnapshot.upsert({
    where: { key },
    create: { key, data: data as never, computedAt: new Date(), durationMs },
    update: { data: data as never, computedAt: new Date(), durationMs },
  });

  if (verbose) console.log(`  → Saved StatsSnapshot "${key}"`);
}

// ============================================
// Legislative stats helpers
// ============================================

function themeLabelFor(theme: string): string {
  return THEME_CATEGORY_LABELS[theme as ThemeCategory] || theme;
}

function themeIconFor(theme: string): string {
  return THEME_CATEGORY_ICONS[theme as ThemeCategory] || "📄";
}

async function computeLegislativeKpi(verbose = false): Promise<LegislativeKpi> {
  if (verbose) console.log("  Computing legislative KPIs...");

  const [scrutinsAnalyses, dossiersEnDiscussion, textesAdoptes] = await Promise.all([
    db.scrutin.count({
      where: { chamber: "AN" },
    }),
    db.legislativeDossier.count({
      where: { status: { in: ["EN_COMMISSION", "EN_COURS"] } },
    }),
    db.legislativeDossier.count({
      where: { status: "ADOPTE" },
    }),
  ]);

  if (verbose)
    console.log(
      `  → KPI: ${scrutinsAnalyses} scrutins AN, ${dossiersEnDiscussion} en discussion, ${textesAdoptes} adoptés`
    );

  return {
    scrutinsAnalyses,
    dossiersEnDiscussion,
    textesAdoptes,
  };
}

async function computeThemeDistribution(
  chamber: "AN" | "SENAT",
  verbose = false
): Promise<ThemeDistributionRow[]> {
  if (verbose) console.log(`  Computing theme distribution for ${chamber}...`);

  const rows = await db.scrutin.groupBy({
    by: ["theme"],
    where: { chamber, theme: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  });

  const result = rows
    .filter((r) => r.theme !== null)
    .map((r) => ({
      theme: r.theme!,
      label: themeLabelFor(r.theme!),
      icon: themeIconFor(r.theme!),
      count: r._count.id,
    }));

  if (verbose) console.log(`  → ${result.length} themes for ${chamber}`);
  return result;
}

async function computePipeline(verbose = false): Promise<PipelineRow[]> {
  if (verbose) console.log("  Computing legislative pipeline...");

  const rows = await db.legislativeDossier.groupBy({
    by: ["theme", "status"],
    where: { theme: { not: null } },
    _count: { id: true },
  });

  const themeMap = new Map<
    string,
    { depose: number; enCommission: number; enCours: number; adopte: number; rejete: number }
  >();

  for (const r of rows) {
    if (!r.theme) continue;
    if (!themeMap.has(r.theme)) {
      themeMap.set(r.theme, { depose: 0, enCommission: 0, enCours: 0, adopte: 0, rejete: 0 });
    }
    const entry = themeMap.get(r.theme)!;
    const count = r._count.id;
    switch (r.status) {
      case "DEPOSE":
        entry.depose += count;
        break;
      case "EN_COMMISSION":
        entry.enCommission += count;
        break;
      case "EN_COURS":
      case "CONSEIL_CONSTITUTIONNEL":
        entry.enCours += count;
        break;
      case "ADOPTE":
        entry.adopte += count;
        break;
      case "REJETE":
      case "RETIRE":
      case "CADUQUE":
        entry.rejete += count;
        break;
    }
  }

  const result = [...themeMap.entries()]
    .map(([theme, counts]) => ({
      theme,
      label: themeLabelFor(theme),
      icon: themeIconFor(theme),
      ...counts,
      total: counts.depose + counts.enCommission + counts.enCours + counts.adopte + counts.rejete,
    }))
    .sort((a, b) => b.total - a.total);

  if (verbose) console.log(`  → ${result.length} themes in pipeline`);
  return result;
}

async function computeKeyVotes(
  chamber: "AN" | "SENAT",
  limit = 5,
  verbose = false
): Promise<KeyVoteRow[]> {
  if (verbose) console.log(`  Computing key votes for ${chamber}...`);

  const scrutins = await db.scrutin.findMany({
    where: { chamber },
    orderBy: { votingDate: "desc" },
    take: 100,
    select: {
      id: true,
      slug: true,
      title: true,
      votingDate: true,
      theme: true,
      votesFor: true,
      votesAgainst: true,
      votesAbstain: true,
      result: true,
    },
  });

  const result = scrutins
    .map((s) => {
      const total = s.votesFor + s.votesAgainst;
      const contestation = total > 0 ? 1 - Math.abs(s.votesFor - s.votesAgainst) / total : 0;
      return {
        id: s.id,
        slug: s.slug,
        title: s.title,
        votingDate: s.votingDate.toISOString(),
        theme: s.theme,
        themeLabel: s.theme ? themeLabelFor(s.theme) : null,
        themeIcon: s.theme ? themeIconFor(s.theme) : null,
        votesFor: s.votesFor,
        votesAgainst: s.votesAgainst,
        votesAbstain: s.votesAbstain,
        result: s.result,
        contestationScore: Math.round(contestation * 100) / 100,
      };
    })
    .sort((a, b) => b.contestationScore - a.contestationScore)
    .slice(0, limit);

  if (verbose) console.log(`  → ${result.length} key votes for ${chamber}`);
  return result;
}

// ============================================
// Main orchestrator
// ============================================

export async function computeStats(
  options: {
    dryRun?: boolean;
    verbose?: boolean;
  } = {}
): Promise<ComputeStatsResult> {
  const { dryRun = false, verbose = false } = options;
  const startTime = Date.now();

  // 1. Compute per-politician participation (the expensive query — ~20s)
  if (verbose) console.log("\n[1/8] Computing per-politician participation...");
  const t1 = Date.now();
  const politicians = await computePoliticianParticipation(verbose);
  const d1 = Date.now() - t1;
  if (verbose) console.log(`  Duration: ${(d1 / 1000).toFixed(1)}s`);

  // 1b. Compute dissidence + theme distribution
  if (verbose) console.log("\n[1b/8] Computing dissidence + theme distribution...");
  const t1b = Date.now();
  const [dissidenceMap, themeMap, dissidencePoliticians] = await Promise.all([
    computeDissidenceData(verbose),
    computeThemeDistributionPerPolitician(verbose),
    getDissidencePoliticians(),
  ]);
  const d1b = Date.now() - t1b;
  if (verbose) console.log(`  Duration: ${(d1b / 1000).toFixed(1)}s`);

  // 2. Persist per-politician rows
  if (verbose) console.log("\n[2/8] Persisting PoliticianParticipation table...");
  await upsertPoliticianParticipation(politicians, dissidenceMap, themeMap, dryRun, verbose);

  // 3. Aggregate and persist party participation (by chamber variants)
  if (verbose) console.log("\n[3/8] Computing party & group participation aggregates...");
  const anPartyAgg = aggregateByParty(politicians);

  // Also need party full names — fetch them
  const partyNames = await db.party.findMany({
    where: {
      id: { in: [...new Set(politicians.map((r) => r.partyId).filter(Boolean) as string[])] },
    },
    select: { id: true, name: true },
  });
  const partyNameMap = new Map(partyNames.map((p) => [p.id, p.name]));

  // Enrich party aggregations with full names
  for (const agg of anPartyAgg) {
    agg.partyName = partyNameMap.get(agg.partyId) || agg.partyShortName;
  }

  await upsertStatsSnapshot("party-participation", anPartyAgg, d1, dryRun, verbose);
  await upsertStatsSnapshot("party-participation-AN", anPartyAgg, d1, dryRun, verbose);

  // 4. Aggregate and persist group participation
  if (verbose) console.log("\n[4/8] Computing group participation aggregates...");
  const anGroupAgg = aggregateByGroup(politicians);

  await upsertStatsSnapshot("group-participation", anGroupAgg, d1, dryRun, verbose);
  await upsertStatsSnapshot("group-participation-AN", anGroupAgg, d1, dryRun, verbose);

  // Old Senate snapshots must not survive the fail-closed candidate phase.
  if (!dryRun) {
    await db.statsSnapshot.deleteMany({
      where: {
        key: { in: ["party-participation-SENAT", "group-participation-SENAT"] },
      },
    });
  }

  // 4b. Aggregate and persist group dissidence
  if (verbose) console.log("\n[4b/8] Computing group dissidence aggregates...");
  const dissidenceAggData = dissidencePoliticians
    .filter((r) => r.groupId)
    .map((r) => ({
      groupId: r.groupId,
      groupCode: r.groupCode,
      groupName: r.groupName,
      groupColor: r.groupColor,
      groupChamber: r.groupChamber,
      dissidenceRate: dissidenceMap.get(r.politicianId)?.dissidenceRate ?? null,
    }));

  const dissidenceAN = aggregateDissidenceByGroup(
    dissidenceAggData.filter((r) => r.groupChamber === "AN")
  );
  const dissidenceSENAT = aggregateDissidenceByGroup(
    dissidenceAggData.filter((r) => r.groupChamber === "SENAT")
  );

  await upsertStatsSnapshot("group-dissidence-AN", dissidenceAN, d1b, dryRun, verbose);
  await upsertStatsSnapshot("group-dissidence-SENAT", dissidenceSENAT, d1b, dryRun, verbose);

  // 5. Compute legislative stats (themes, pipeline, key votes)
  if (verbose) console.log("\n[5/8] Computing legislative stats...");
  const t5 = Date.now();

  const [legislativeKpi, themesAN, themesSENAT, pipeline, keyVotesAN, keyVotesSENAT] =
    await Promise.all([
      computeLegislativeKpi(verbose),
      computeThemeDistribution("AN", verbose),
      computeThemeDistribution("SENAT", verbose),
      computePipeline(verbose),
      computeKeyVotes("AN", 5, verbose),
      computeKeyVotes("SENAT", 5, verbose),
    ]);

  const d5 = Date.now() - t5;
  if (verbose) console.log(`  Duration: ${(d5 / 1000).toFixed(1)}s`);

  await upsertStatsSnapshot("legislative-kpi", legislativeKpi, d5, dryRun, verbose);
  await upsertStatsSnapshot("legislative-themes-AN", themesAN, d5, dryRun, verbose);
  await upsertStatsSnapshot("legislative-themes-SENAT", themesSENAT, d5, dryRun, verbose);
  await upsertStatsSnapshot("legislative-pipeline", pipeline, d5, dryRun, verbose);
  await upsertStatsSnapshot("legislative-votes-AN", keyVotesAN, d5, dryRun, verbose);
  await upsertStatsSnapshot("legislative-votes-SENAT", keyVotesSENAT, d5, dryRun, verbose);

  const totalDuration = Date.now() - startTime;
  if (verbose) {
    console.log(`\n[8/8] Done in ${(totalDuration / 1000).toFixed(1)}s`);
    console.log(`  Politicians: ${politicians.length}`);
    console.log(`  Party aggregates: ${anPartyAgg.length}`);
    console.log(`  Group aggregates: ${anGroupAgg.length}`);
    console.log(`  Dissidence data: ${dissidenceMap.size} politicians`);
    console.log(`  Theme data: ${themeMap.size} politicians`);
  }

  return {
    politicians: politicians.length,
    parties: anPartyAgg.length,
    groups: anGroupAgg.length,
    durationMs: totalDuration,
  };
}
