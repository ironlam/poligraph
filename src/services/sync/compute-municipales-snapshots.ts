import { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import {
  MUNICIPALES_SNAPSHOT_KEYS,
  type ParityOutliers,
  type ParityListRow,
  type ParityBySize,
  type DeptPartyData,
} from "@/types/stats-snapshots";

/**
 * Compute the four heavy municipales-2026 aggregations and upsert into StatsSnapshot.
 *
 * Called by:
 *   - npm run sync:municipales-snapshots (CLI)
 *   - Inngest cron (sync-daily DAILY_STEPS)
 *   - Inngest manual trigger (admin /syncs page)
 *
 * Idempotent. Safe to run concurrently — the upsert key prevents duplicates.
 */
export async function computeMunicipalesSnapshots(): Promise<{
  ok: true;
  computed: string[];
  totalDurationMs: number;
}> {
  const t0 = Date.now();
  const election = await db.election.findUnique({
    where: { slug: "municipales-2026" },
    select: { id: true },
  });
  if (!election) {
    throw new Error("Election municipales-2026 not found — cannot compute snapshots");
  }

  const computed: string[] = [];

  // ─── 1. Parity outliers (best + worst combined) ─────────
  await runAndUpsert(
    MUNICIPALES_SNAPSHOT_KEYS.parityOutliers,
    () => computeParityOutliersLive(election.id),
    computed
  );

  // ─── 2. Parity by population bracket ────────────────────
  await runAndUpsert(
    MUNICIPALES_SNAPSHOT_KEYS.parityBySize,
    () => computeParityBySizeLive(election.id),
    computed
  );

  // ─── 3. Department × party counts ───────────────────────
  await runAndUpsert(
    MUNICIPALES_SNAPSHOT_KEYS.deptParty,
    () => computeDepartmentPartyDataLive(election.id),
    computed
  );

  return { ok: true, computed, totalDurationMs: Date.now() - t0 };
}

async function runAndUpsert<T>(
  key: string,
  fn: () => Promise<T>,
  computed: string[]
): Promise<void> {
  const t0 = Date.now();
  const data = await fn();
  const durationMs = Date.now() - t0;
  await db.statsSnapshot.upsert({
    where: { key },
    create: { key, data: data as Prisma.InputJsonValue, durationMs },
    update: { data: data as Prisma.InputJsonValue, durationMs, computedAt: new Date() },
  });
  computed.push(`${key} (${durationMs}ms)`);
  console.log(`  [snapshot] ${key} -> ${durationMs}ms`);
}

// ─── Live computers (also exported for fallback in src/lib/data/municipales.ts) ──

export async function computeParityOutliersLive(electionId: string): Promise<ParityOutliers> {
  // Une seule passe d'agrégation (CTE `agg`, référencée deux fois → matérialisée
  // une seule fois par Postgres) au lieu de deux scans complets. La jointure
  // `Commune` (nom + département) est différée aux 20 lignes finales seulement,
  // ce qui la sort du hot path. Voir EXPLAIN dans la PR pour les gains.
  const rows = await db.$queryRaw<
    Array<{
      bucket: "best" | "worst";
      listName: string;
      communeId: string;
      communeName: string;
      departmentCode: string;
      femaleRate: number;
      candidateCount: number;
    }>
  >(Prisma.sql`
    WITH agg AS (
      SELECT
        c."listName" AS list_name,
        c."communeId" AS commune_id,
        COUNT(*) FILTER (WHERE ca."gender" = 'F')::float / NULLIF(COUNT(*)::float, 0) AS female_rate,
        COUNT(*)::int AS candidate_count
      FROM "Candidacy" c
      JOIN "Candidate" ca ON c."candidateId" = ca.id
      WHERE c."electionId" = ${electionId}
        AND ca."gender" IS NOT NULL
        AND c."listName" IS NOT NULL
        AND c."communeId" IS NOT NULL
      GROUP BY c."listName", c."communeId"
      HAVING COUNT(*) >= 10
    ),
    best AS (
      SELECT list_name, commune_id, female_rate, candidate_count, 'best'::text AS bucket
      FROM agg ORDER BY ABS(0.5 - female_rate) ASC LIMIT 10
    ),
    worst AS (
      SELECT list_name, commune_id, female_rate, candidate_count, 'worst'::text AS bucket
      FROM agg ORDER BY ABS(0.5 - female_rate) DESC LIMIT 10
    )
    SELECT
      picked.bucket,
      picked.list_name AS "listName",
      co.id AS "communeId",
      co.name AS "communeName",
      co."departmentCode" AS "departmentCode",
      picked.female_rate AS "femaleRate",
      picked.candidate_count AS "candidateCount"
    FROM (SELECT * FROM best UNION ALL SELECT * FROM worst) picked
    JOIN "Commune" co ON picked.commune_id = co.id
    ORDER BY
      picked.bucket,
      (CASE WHEN picked.bucket = 'best'
            THEN ABS(0.5 - picked.female_rate)
            ELSE -ABS(0.5 - picked.female_rate) END) ASC
  `);

  const best: ParityListRow[] = [];
  const worst: ParityListRow[] = [];
  for (const r of rows) {
    const row: ParityListRow = {
      listName: r.listName,
      communeId: r.communeId,
      communeName: r.communeName,
      departmentCode: r.departmentCode,
      femaleRate: r.femaleRate,
      candidateCount: r.candidateCount,
    };
    if (r.bucket === "best") best.push(row);
    else worst.push(row);
  }

  return { best, worst };
}

export async function computeParityBySizeLive(electionId: string): Promise<ParityBySize> {
  const rows = await db.$queryRaw<
    Array<{ bracket: string; femaleCount: number; totalCount: number }>
  >(Prisma.sql`
    SELECT
      CASE
        WHEN co.population < 1000 THEN '< 1 000 hab.'
        WHEN co.population < 10000 THEN '1 000 - 10 000 hab.'
        WHEN co.population < 50000 THEN '10 000 - 50 000 hab.'
        ELSE '50 000+ hab.'
      END as bracket,
      COUNT(*) FILTER (WHERE ca."gender" = 'F')::int as "femaleCount",
      COUNT(*)::int as "totalCount"
    FROM "Candidacy" c
    JOIN "Commune" co ON c."communeId" = co.id
    JOIN "Candidate" ca ON c."candidateId" = ca.id
    WHERE c."electionId" = ${electionId}
      AND ca."gender" IS NOT NULL AND co.population IS NOT NULL
    GROUP BY bracket
    ORDER BY MIN(co.population)
  `);

  return rows.map((r) => ({
    bracket: r.bracket,
    femaleRate: r.totalCount > 0 ? r.femaleCount / r.totalCount : 0,
    femaleCount: r.femaleCount,
    maleCount: r.totalCount - r.femaleCount,
    totalCount: r.totalCount,
  }));
}

export async function computeDepartmentPartyDataLive(electionId: string): Promise<DeptPartyData> {
  const rows = await db.$queryRaw<
    Array<{
      departmentCode: string;
      departmentName: string;
      partyLabel: string;
      listCount: number;
    }>
  >(Prisma.sql`
    SELECT co."departmentCode", co."departmentName", c."partyLabel",
           COUNT(DISTINCT c."listName")::int as "listCount"
    FROM "Candidacy" c
    JOIN "Commune" co ON c."communeId" = co.id
    WHERE c."electionId" = ${electionId} AND c."partyLabel" IS NOT NULL
    GROUP BY co."departmentCode", co."departmentName", c."partyLabel"
    ORDER BY co."departmentCode", "listCount" DESC
  `);

  const deptMap = new Map<
    string,
    {
      code: string;
      name: string;
      parties: Array<{ label: string; listCount: number }>;
      totalLists: number;
    }
  >();
  for (const row of rows) {
    const existing = deptMap.get(row.departmentCode) || {
      code: row.departmentCode,
      name: row.departmentName,
      parties: [],
      totalLists: 0,
    };
    existing.parties.push({ label: row.partyLabel, listCount: row.listCount });
    existing.totalLists += row.listCount;
    deptMap.set(row.departmentCode, existing);
  }

  return Array.from(deptMap.values()).map((dept) => ({
    ...dept,
    dominantParty: dept.parties[0]?.label ?? null,
  }));
}
