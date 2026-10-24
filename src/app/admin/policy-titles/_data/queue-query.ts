import { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";

/**
 * Moderation queue query for ScrutinPolicyTitle rows.
 *
 * Implemented as a single `$queryRaw` rather than Prisma `where`, because the
 * queue needs predicates Prisma cannot express cleanly in one pass:
 *  - JSON-array membership (warningCode / severity over currentWarnings &
 *    generationWarnings, substanceDepth over qualitySignals),
 *  - char-length filtering on policyTitle,
 *  - `ORDER BY random()` for the `sample` mode,
 *  - a SUB_AMENDMENT EXISTS subquery.
 * Doing it in raw SQL keeps `total` and pagination consistent with the filters.
 */

export interface QueueRow {
  scrutinId: string;
  scrutinExternalId: string;
  votingDate: Date;
  officialTitleSnapshot: string;
  policyTitle: string | null;
  proceduralLabel: string;
  status: string;
  confidence: string;
  generationSource: string;
  substanceDepth: string | null;
  evidenceCount: number;
  warningCount: number;
  hasBlocker: boolean;
  regenerationStatus: string;
  isSubAmendment: boolean;
  result: string;
}

export interface QueueFilters {
  status?: string[];
  confidence?: ("HIGH" | "MEDIUM" | "LOW")[];
  generationSource?: string[];
  warningCode?: string;
  severity?: "blocker" | "warn" | "clean";
  substanceDepth?: string[];
  titleLengthMin?: number;
  titleLengthMax?: number;
  nullTitle?: boolean;
  subAmendmentOnly?: boolean;
  q?: string;
  sort?: "votingDate" | "confidence" | "generatedAt";
  sample?: number;
  take?: number;
  skip?: number;
}

const DEFAULT_STATUSES = ["DRAFT", "NEEDS_REVIEW"];
const DEFAULT_TAKE = 50;

interface RawRow {
  scrutinId: string;
  scrutinExternalId: string;
  votingDate: Date;
  officialTitleSnapshot: string;
  policyTitle: string | null;
  proceduralLabel: string;
  status: string;
  confidence: string;
  generationSource: string;
  substanceDepth: string | null;
  evidenceCount: bigint | number;
  warningCount: bigint | number;
  hasBlocker: boolean;
  regenerationStatus: string;
  isSubAmendment: boolean;
  result: string;
}

function buildWhere(filters: QueueFilters): Prisma.Sql {
  const conds: Prisma.Sql[] = [];

  const statuses = filters.status && filters.status.length > 0 ? filters.status : DEFAULT_STATUSES;
  conds.push(Prisma.sql`pt."status"::text IN (${Prisma.join(statuses)})`);

  if (filters.confidence && filters.confidence.length > 0) {
    conds.push(Prisma.sql`pt."confidence"::text IN (${Prisma.join(filters.confidence)})`);
  }

  if (filters.generationSource && filters.generationSource.length > 0) {
    conds.push(
      Prisma.sql`pt."generationSource"::text IN (${Prisma.join(filters.generationSource)})`
    );
  }

  if (filters.warningCode) {
    // Match a code in EITHER currentWarnings OR generationWarnings.
    conds.push(
      Prisma.sql`(
        EXISTS (SELECT 1 FROM jsonb_array_elements(pt."currentWarnings") w WHERE w->>'code' = ${filters.warningCode})
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(pt."generationWarnings") w WHERE w->>'code' = ${filters.warningCode})
      )`
    );
  }

  if (filters.severity === "blocker") {
    conds.push(
      Prisma.sql`EXISTS (SELECT 1 FROM jsonb_array_elements(pt."currentWarnings") w WHERE w->>'severity' = 'blocker')`
    );
  } else if (filters.severity === "warn") {
    conds.push(
      Prisma.sql`jsonb_array_length(pt."currentWarnings") > 0
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(pt."currentWarnings") w WHERE w->>'severity' = 'blocker')`
    );
  } else if (filters.severity === "clean") {
    conds.push(Prisma.sql`jsonb_array_length(pt."currentWarnings") = 0`);
  }

  if (filters.substanceDepth && filters.substanceDepth.length > 0) {
    const depthConds: Prisma.Sql[] = [];
    for (const d of filters.substanceDepth) {
      if (d === "null") {
        depthConds.push(Prisma.sql`(pt."qualitySignals"->>'substanceDepth' IS NULL)`);
      } else {
        depthConds.push(Prisma.sql`(pt."qualitySignals"->>'substanceDepth' = ${d})`);
      }
    }
    conds.push(Prisma.sql`(${Prisma.join(depthConds, " OR ")})`);
  }

  if (filters.nullTitle) {
    conds.push(Prisma.sql`pt."policyTitle" IS NULL`);
  }

  if (filters.titleLengthMin !== undefined) {
    conds.push(
      Prisma.sql`pt."policyTitle" IS NOT NULL AND char_length(pt."policyTitle") >= ${filters.titleLengthMin}`
    );
  }
  if (filters.titleLengthMax !== undefined) {
    conds.push(
      Prisma.sql`pt."policyTitle" IS NOT NULL AND char_length(pt."policyTitle") <= ${filters.titleLengthMax}`
    );
  }

  if (filters.subAmendmentOnly) {
    conds.push(
      Prisma.sql`EXISTS (
        SELECT 1 FROM "ScrutinAmendment" sa
        WHERE sa."scrutinId" = s."id" AND sa."role" = 'SUB_AMENDMENT'
      )`
    );
  }

  if (filters.q) {
    const like = `%${filters.q}%`;
    conds.push(
      Prisma.sql`(pt."officialTitleSnapshot" ILIKE ${like} OR pt."policyTitle" ILIKE ${like})`
    );
  }

  return Prisma.join(conds, " AND ");
}

function orderClause(filters: QueueFilters): Prisma.Sql {
  if (filters.sample !== undefined) {
    return Prisma.sql`ORDER BY random()`;
  }
  switch (filters.sort) {
    case "confidence":
      // HIGH first, then MEDIUM, then LOW.
      return Prisma.sql`ORDER BY array_position(ARRAY['HIGH','MEDIUM','LOW'], pt."confidence"::text), s."votingDate" DESC, s."sequence" DESC`;
    case "generatedAt":
      return Prisma.sql`ORDER BY pt."generatedAt" DESC`;
    case "votingDate":
    default:
      return Prisma.sql`ORDER BY s."votingDate" DESC, s."sequence" DESC`;
  }
}

export async function queryQueue(
  filters: QueueFilters = {}
): Promise<{ rows: QueueRow[]; total: number }> {
  const where = buildWhere(filters);

  const limit = filters.sample !== undefined ? filters.sample : (filters.take ?? DEFAULT_TAKE);
  const offset = filters.sample !== undefined ? 0 : (filters.skip ?? 0);

  const rowsRaw = await db.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT
      s."id"                                            AS "scrutinId",
      s."externalId"                                    AS "scrutinExternalId",
      s."votingDate"                                    AS "votingDate",
      s."result"::text                                  AS "result",
      pt."officialTitleSnapshot"                        AS "officialTitleSnapshot",
      pt."policyTitle"                                  AS "policyTitle",
      pt."proceduralLabel"                              AS "proceduralLabel",
      pt."status"::text                                 AS "status",
      pt."confidence"::text                             AS "confidence",
      pt."generationSource"::text                       AS "generationSource",
      pt."qualitySignals"->>'substanceDepth'            AS "substanceDepth",
      pt."regenerationStatus"::text                     AS "regenerationStatus",
      jsonb_array_length(pt."evidenceQuotes")           AS "evidenceCount",
      jsonb_array_length(pt."currentWarnings")          AS "warningCount",
      EXISTS (
        SELECT 1 FROM jsonb_array_elements(pt."currentWarnings") w
        WHERE w->>'severity' = 'blocker'
      )                                                 AS "hasBlocker",
      EXISTS (
        SELECT 1 FROM "ScrutinAmendment" sa
        WHERE sa."scrutinId" = s."id" AND sa."role" = 'SUB_AMENDMENT'
      )                                                 AS "isSubAmendment"
    FROM "ScrutinPolicyTitle" pt
    JOIN "Scrutin" s ON s."id" = pt."scrutinId"
    WHERE ${where}
    ${orderClause(filters)}
    LIMIT ${limit} OFFSET ${offset}
  `);

  const countResult = await db.$queryRaw<{ count: bigint }[]>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count
    FROM "ScrutinPolicyTitle" pt
    JOIN "Scrutin" s ON s."id" = pt."scrutinId"
    WHERE ${where}
  `);
  const total = Number(countResult[0]?.count ?? 0);

  const rows: QueueRow[] = rowsRaw.map((r) => ({
    scrutinId: r.scrutinId,
    scrutinExternalId: r.scrutinExternalId,
    votingDate: r.votingDate,
    officialTitleSnapshot: r.officialTitleSnapshot,
    policyTitle: r.policyTitle,
    proceduralLabel: r.proceduralLabel,
    status: r.status,
    confidence: r.confidence,
    generationSource: r.generationSource,
    substanceDepth: r.substanceDepth,
    evidenceCount: Number(r.evidenceCount),
    warningCount: Number(r.warningCount),
    hasBlocker: r.hasBlocker,
    regenerationStatus: r.regenerationStatus,
    isSubAmendment: r.isSubAmendment,
    result: r.result,
  }));

  return { rows, total };
}
