/**
 * Population in force for a commune, read from `CommunePopulation` (lot 1.7 Territoires).
 * Uncached on purpose: called from inside the cached commune and department readers.
 *
 * "In force" is decided in SQL against CURRENT_DATE, so a vintage imported before its
 * effective date (INSEE publishes in December for 1 January) is never shown early.
 */
import { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import { POPULATION_SYNC_KEY } from "@/config/populations-reference";

export interface PopulationVintage {
  millesime: number;
  /** ISO date (yyyy-mm-dd) from which the decree applies the figures. */
  effectiveFrom: string;
  /** Short producer name: INSEE, ISPF, ISEE, INSEE-STSEE. */
  producer: string;
  sourceLabel: string;
  sourceUrl: string;
  /** ISO timestamp of the import that last wrote the figures of this row. */
  importedAt: string;
}

interface VintageRow {
  millesime: number;
  effectiveFrom: Date;
  producer: string;
  sourceLabel: string;
  sourceUrl: string;
  importedAt: Date;
}

/**
 * True when the table is not created yet: the code can ship before the manual migration
 * (prisma/migrations/manual/2026-10-11_commune-population.sql) and the pages then keep their
 * previous behaviour instead of failing. Any other error propagates.
 */
export function isMissingTableError(error: unknown): boolean {
  const meta = (error as { meta?: { driverAdapterError?: { cause?: { kind?: string } } } })?.meta;
  return meta?.driverAdapterError?.cause?.kind === "TableDoesNotExist";
}

async function tolerateMissingTable<T>(query: Promise<T>, fallback: T): Promise<T> {
  try {
    return await query;
  } catch (error) {
    if (isMissingTableError(error)) return fallback;
    throw error;
  }
}

function toVintage(r: VintageRow): PopulationVintage {
  return {
    millesime: r.millesime,
    effectiveFrom: r.effectiveFrom.toISOString().slice(0, 10),
    producer: r.producer,
    sourceLabel: r.sourceLabel,
    sourceUrl: r.sourceUrl,
    importedAt: r.importedAt.toISOString(),
  };
}

/**
 * Population in force, with `verifiedAt`: the last import that checked every row against its
 * source (SyncMetadata), falling back on the row's own import date.
 */
export async function readPopulationEnVigueur(
  communeId: string
): Promise<{ value: number; vintage: PopulationVintage; verifiedAt: string } | null> {
  const rows = await tolerateMissingTable(
    db.$queryRaw<(VintageRow & { populationMunicipale: number })[]>(Prisma.sql`
    SELECT p."populationMunicipale", p."millesime", p."effectiveFrom", p."producer",
           p."sourceLabel", p."sourceUrl", p."importedAt"
    FROM "CommunePopulation" p
    WHERE p."communeId" = ${communeId} AND p."effectiveFrom" <= CURRENT_DATE
    ORDER BY p."effectiveFrom" DESC
    LIMIT 1
  `),
    []
  );
  const row = rows[0];
  if (!row) return null;
  const meta = await db.syncMetadata.findUnique({
    where: { sourceKey: POPULATION_SYNC_KEY },
    select: { lastSyncAt: true },
  });
  const vintage = toVintage(row);
  return {
    value: row.populationMunicipale,
    vintage,
    verifiedAt: meta?.lastSyncAt?.toISOString() ?? vintage.importedAt,
  };
}

/**
 * Vintages in force across a department, with the number of communes each covers. One entry
 * almost everywhere; the list form keeps a mixed department honest instead of picking one.
 */
export async function readDepartementPopulationVintages(
  departmentCode: string
): Promise<(PopulationVintage & { communes: number })[]> {
  const rows = await tolerateMissingTable(
    db.$queryRaw<(VintageRow & { communes: number })[]>(Prisma.sql`
    SELECT v."millesime", v."effectiveFrom", v."producer", v."sourceLabel", v."sourceUrl",
           MAX(v."importedAt") AS "importedAt", COUNT(*)::int AS "communes"
    FROM (
      SELECT DISTINCT ON (p."communeId") p.*
      FROM "CommunePopulation" p
      JOIN "Commune" c ON c."id" = p."communeId"
      WHERE c."departmentCode" = ${departmentCode} AND p."effectiveFrom" <= CURRENT_DATE
      ORDER BY p."communeId", p."effectiveFrom" DESC
    ) v
    GROUP BY v."millesime", v."effectiveFrom", v."producer", v."sourceLabel", v."sourceUrl"
    ORDER BY COUNT(*) DESC
    LIMIT 5
  `),
    []
  );
  return rows.map((r) => ({ ...toVintage(r), communes: r.communes }));
}

export interface PopulationSeriesPoint {
  millesime: number;
  value: number;
  producer: string;
  effectiveFrom: string;
}

/**
 * The two latest vintages in force of a commune, newest first. Feeds the evolution of "Le
 * territoire en chiffres": the importer drops a commune whose territory changed between two
 * vintages, so two rows from the national INSEE files are on a constant perimeter.
 */
export async function readPopulationSeries(communeId: string): Promise<PopulationSeriesPoint[]> {
  const rows = await tolerateMissingTable(
    db.$queryRaw<
      { millesime: number; populationMunicipale: number; producer: string; effectiveFrom: Date }[]
    >(Prisma.sql`
    SELECT p."millesime", p."populationMunicipale", p."producer", p."effectiveFrom"
    FROM "CommunePopulation" p
    WHERE p."communeId" = ${communeId} AND p."effectiveFrom" <= CURRENT_DATE
    ORDER BY p."effectiveFrom" DESC
    LIMIT 2
  `),
    []
  );
  return rows.map((r) => ({
    millesime: r.millesime,
    value: r.populationMunicipale,
    producer: r.producer,
    effectiveFrom: r.effectiveFrom.toISOString().slice(0, 10),
  }));
}
