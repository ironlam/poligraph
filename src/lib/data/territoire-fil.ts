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
      select: {
        id: true,
        type: true,
        occurredOn: true,
        payload: true,
        sourceLabel: true,
        sourceUrl: true,
      },
    });
  } catch (error) {
    // The code can ship before prisma/migrations/manual/2026-11-15-territoire-evenements.sql.
    if (isMissingTableError(error)) return [];
    throw error;
  }

  return rows
    .flatMap((row) => {
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
    })
    .slice(0, FIL_LIMIT);
}
