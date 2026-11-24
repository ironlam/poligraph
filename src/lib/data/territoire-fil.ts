import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/db";
import { isMissingTableError } from "@/lib/data/commune-population";
import type { RepereTerritoryKind } from "@/config/territoire-reperes";
import {
  isEvenementSourceUrl,
  parseEvenementPayload,
  type TerritoireEvenementPayload,
} from "@/lib/territoires/evenements";

/**
 * Reader of the "fil du territoire" (Territoires v2, lot B): the latest published events of one
 * territory. One territory per call, so nothing here can compare two of them.
 */

export interface FilEvenement {
  id: string;
  /** ISO date (yyyy-mm-dd) of the fact. */
  date: string;
  evenement: TerritoireEvenementPayload;
  source: { label: string; url: string };
}

/** The block shows three lines at most. */
export const FIL_LIMIT = 3;
/** Rows read to fill them: a row whose payload no longer matches its schema is skipped. */
const FIL_READ = FIL_LIMIT * 2;

/** Same tags as the page readers of `territoires.ts`: a region is `territoire:region-<code>`. */
function territoireTag(type: RepereTerritoryKind, code: string): string {
  return type === "REG" ? `territoire:region-${code}` : `territoire:${code}`;
}

/** Published events of one territory, most recent first. Empty while nothing is published. */
export async function getFilTerritoire(
  type: RepereTerritoryKind,
  code: string
): Promise<FilEvenement[]> {
  "use cache";
  cacheLife("synced");
  cacheTag("territoires", territoireTag(type, code));

  let rows;
  try {
    rows = await db.territoireEvenement.findMany({
      where: { territoryType: type, territoryCode: code, status: "PUBLISHED" },
      orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
      take: FIL_READ,
      select: SELECT,
    });
  } catch (error) {
    // The code can ship before prisma/migrations/manual/2026-11-15-territoire-evenements.sql.
    if (isMissingTableError(error)) return [];
    throw error;
  }

  return lignes(rows).slice(0, FIL_LIMIT);
}

/** The audit chamber reports listed under the accounts block: the most recent ones, bounded. */
export const RAPPORTS_CRC_LIMIT = 20;

/**
 * Published report notices of one territory, most recent first. Same cache profile and tags as
 * the fil: a publication in the admin shows within the 24 h of `synced`, like every event.
 */
export async function getRapportsCrcTerritoire(
  type: RepereTerritoryKind,
  code: string
): Promise<FilEvenement[]> {
  "use cache";
  cacheLife("synced");
  cacheTag("territoires", territoireTag(type, code));

  try {
    const rows = await db.territoireEvenement.findMany({
      where: { type: "RAPPORT_CRC", territoryType: type, territoryCode: code, status: "PUBLISHED" },
      orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
      take: RAPPORTS_CRC_LIMIT,
      select: SELECT,
    });
    return lignes(rows);
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

const SELECT = {
  id: true,
  type: true,
  occurredOn: true,
  payload: true,
  sourceLabel: true,
  sourceUrl: true,
} as const;

/** Rows whose payload still matches its schema and whose source is a plain https link. */
function lignes(
  rows: Array<{
    id: string;
    type: string;
    occurredOn: Date;
    payload: unknown;
    sourceLabel: string;
    sourceUrl: string;
  }>
): FilEvenement[] {
  return rows.flatMap((row) => {
    const evenement = parseEvenementPayload(row.type, row.payload);
    if (!evenement || !isEvenementSourceUrl(row.sourceUrl)) return [];
    return [
      {
        id: row.id,
        date: row.occurredOn.toISOString().slice(0, 10),
        evenement,
        source: { label: row.sourceLabel, url: row.sourceUrl },
      },
    ];
  });
}
