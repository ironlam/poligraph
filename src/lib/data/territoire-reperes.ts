import { cacheLife, cacheTag } from "next/cache";
import { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import { isMissingTableError } from "@/lib/data/commune-population";
import { repereIndicator, type RepereTerritoryKind } from "@/config/territoire-reperes";
import {
  COMPTES_AGREGATS,
  COMPTES_DERNIER_EXERCICE,
  COMPTES_INDICATOR_PREFIX,
  COMPTES_PREMIER_EXERCICE,
} from "@/config/territoire-comptes";

/**
 * Reader of "Le territoire en chiffres" (#1052, lot R0). One page, one query, one territory:
 * the signature takes a single code, so no comparison between territories is possible from here.
 *
 * Only rows of a PUBLISHED import are read. An absent figure is a state (`NON_ETABLI`) with a null
 * value, never a zero. Nothing in this file reads an elected official or a party.
 */

export type RepereState =
  | "ETABLI"
  | "PARTIEL"
  | "NON_ETABLI"
  | "SECRET_STATISTIQUE"
  | "HORS_COUVERTURE";

export type RepereScopeKind = "COMMUNE" | "UDI" | "STATION" | "DEPARTEMENT";

export interface RepereSourceRef {
  producer: string;
  resourceUrl: string;
  licenceName: string;
  licenceUrl: string;
  attribution: string;
  /** Null when the source feeds several method pages: the indicator config names its page. */
  methodSlug: string | null;
  /** ISO timestamp of the import that wrote the row. */
  importedAt: string;
}

export interface RepereRow {
  indicatorKey: string;
  /** ISO dates (yyyy-mm-dd) of the observed period. */
  periodStart: string;
  periodEnd: string;
  scopeKind: RepereScopeKind;
  /** Stable identifier of the measured scope (UDI code, station number), empty for a commune. */
  scopeId: string;
  scopeLabel: string | null;
  /** Null unless the state is ETABLI or PARTIEL. */
  value: number | null;
  unit: string;
  sampleSize: number | null;
  state: RepereState;
  reason: string | null;
  source: RepereSourceRef;
}

/** Upper bound of one page read: a territory never carries more than this many figures. */
export const REPERES_PAGE_LIMIT = 200;

/**
 * Upper bound of one accounts read: five aggregates, two measures, one row per exercise of the
 * series (D28 keeps the accounts out of "Le territoire en chiffres", and out of its read).
 */
export const COMPTES_PAGE_LIMIT =
  COMPTES_AGREGATS.length * 2 * (COMPTES_DERNIER_EXERCICE - COMPTES_PREMIER_EXERCICE + 1);

interface RawRow {
  indicatorKey: string;
  periodStart: Date;
  periodEnd: Date;
  scopeKind: RepereScopeKind;
  scopeId: string;
  scopeLabel: string | null;
  value: number | null;
  unit: string;
  sampleSize: number | null;
  state: RepereState;
  reason: string | null;
  producer: string;
  resourceUrl: string;
  licenceName: string;
  licenceUrl: string;
  attribution: string;
  methodSlug: string | null;
  importedAt: Date;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

function toRow(r: RawRow): RepereRow {
  // A value never survives a state that says there is none: no figure reads as a zero downstream.
  const hasValue = r.state === "ETABLI" || r.state === "PARTIEL";
  return {
    indicatorKey: r.indicatorKey,
    periodStart: day(r.periodStart),
    periodEnd: day(r.periodEnd),
    scopeKind: r.scopeKind,
    scopeId: r.scopeId,
    scopeLabel: r.scopeLabel,
    value: hasValue && r.value !== null ? Number(r.value) : null,
    unit: r.unit,
    sampleSize: r.sampleSize,
    state: r.state,
    reason: r.reason,
    source: {
      producer: r.producer,
      resourceUrl: r.resourceUrl,
      licenceName: r.licenceName,
      licenceUrl: r.licenceUrl,
      attribution: r.attribution,
      methodSlug: r.methodSlug,
      importedAt: r.importedAt.toISOString(),
    },
  };
}

type RepereFamily = "CHIFFRES" | "COMPTES";

/**
 * Published rows of one territory and one family, in a single query on the unique index
 * (territoryType, territoryCode, indicatorKey, ...). Measured on 2026-11-22 for Brest: index scan,
 * 0.8 ms, at most 27 published rows per territory before the accounts.
 */
async function queryReperes(
  type: RepereTerritoryKind,
  code: string,
  family: RepereFamily
): Promise<RepereRow[]> {
  const familyFilter =
    family === "COMPTES"
      ? Prisma.sql`AND starts_with(r."indicatorKey", ${COMPTES_INDICATOR_PREFIX})`
      : Prisma.sql`AND NOT starts_with(r."indicatorKey", ${COMPTES_INDICATOR_PREFIX})`;
  const limit = family === "COMPTES" ? COMPTES_PAGE_LIMIT : REPERES_PAGE_LIMIT;
  try {
    const rows = await db.$queryRaw<RawRow[]>(Prisma.sql`
      SELECT r."indicatorKey", r."periodStart", r."periodEnd", r."scopeKind", r."scopeId", r."scopeLabel",
             r."value", r."unit", r."state", r."reason", r."sampleSize",
             s."producer", s."resourceUrl", s."licenceName", s."licenceUrl", s."attribution",
             s."methodSlug", i."importedAt"
      FROM "TerritoireRepere" r
      JOIN "RepereImport" i ON i."id" = r."importId" AND i."status" = 'PUBLISHED'
      JOIN "RepereSource" s ON s."id" = i."sourceId"
      WHERE r."territoryType" = ${type}::"RepereTerritoryType" AND r."territoryCode" = ${code}
        ${familyFilter}
      ORDER BY r."indicatorKey", r."periodEnd" DESC, r."scopeLabel", r."scopeId"
      LIMIT ${limit}
    `);
    return rows.map(toRow);
  } catch (error) {
    // The code can ship before prisma/migrations/manual/2026-10-13-territoire-reperes.sql.
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

/** Published figures of "Le territoire en chiffres" for one territory. Empty while nothing is published. */
export async function getTerritoireReperes(
  type: RepereTerritoryKind,
  code: string
): Promise<RepereRow[]> {
  "use cache";
  // No tag is set by a publication: pages follow the 24 h `synced` profile (no mass revalidation).
  cacheTag("territoires", `reperes:${type}:${code}`);
  cacheLife("synced");
  return queryReperes(type, code, "CHIFFRES");
}

/** Published rows of "Les comptes de la collectivité" for one territory, every exercise. */
export async function getTerritoireComptesRows(
  type: RepereTerritoryKind,
  code: string
): Promise<RepereRow[]> {
  "use cache";
  cacheTag("territoires", `comptes:${type}:${code}`);
  cacheLife("synced");
  return queryReperes(type, code, "COMPTES");
}

export interface RepereReading {
  indicatorKey: string;
  /** Every published row of the indicator, most recent period first. */
  rows: RepereRow[];
  /** Most recent row, or the default "non établi" one when nothing is published. */
  latest: RepereRow | null;
  state: RepereState;
}

/**
 * The reading of one indicator on one scale. No published row means `NON_ETABLI`; an indicator
 * that does not exist at this scale is `NON_APPLICABLE`, which the caller says in words. Never a
 * zero.
 */
export function readIndicator(
  rows: RepereRow[],
  indicatorKey: string,
  scale: RepereTerritoryKind
): RepereReading | "NON_APPLICABLE" {
  const def = repereIndicator(indicatorKey);
  if (def && !def.scales.includes(scale)) return "NON_APPLICABLE";
  const own = rows.filter((r) => r.indicatorKey === indicatorKey);
  const latest = own[0] ?? null;
  return { indicatorKey, rows: own, latest, state: latest?.state ?? "NON_ETABLI" };
}
