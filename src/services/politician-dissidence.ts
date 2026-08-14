import { db } from "@/lib/db";
import {
  computePoliticianDissidence,
  findGroupMajority,
  type GroupVoteEntry,
  type PoliticianVoteWithGroup,
} from "@/services/sync/dissidence";

export interface PoliticianDissidenceResult {
  count: number;
  total: number;
  rate: number;
}

/**
 * Compute one politician's live dissidence from a target-bounded vote population.
 * The first query resolves only the target's applicable votes. Group majorities
 * are then computed only for the resulting (scrutin, group) pairs.
 */
export async function computeTargetedPoliticianDissidence(
  politicianId: string
): Promise<PoliticianDissidenceResult | null> {
  // Keep the live SQL literal. Next.js serializes an imported Prisma Sql fragment
  // as a bound `$1`, which is invalid where PostgreSQL expects a JOIN. Parity tests
  // lock this predicate to the shared batch doctrine.
  const targetVotes = await db.$queryRaw<PoliticianVoteWithGroup[]>`
    SELECT
      v."politicianId",
      v."scrutinId",
      mp."parliamentaryGroupId" as "groupId",
      v.position
    FROM "Vote" v
    JOIN "Mandate" m ON m."politicianId" = v."politicianId"
      AND m."isCurrent" = true
      AND m.type IN ('DEPUTE'::"MandateType", 'SENATEUR'::"MandateType")
    JOIN "MandateParliamentary" mp ON mp."mandateId" = m.id
    WHERE v."politicianId" = ${politicianId}
      AND v.position IN ('POUR', 'CONTRE', 'ABSTENTION')
      AND v.chamber = CASE
        WHEN m.type = 'DEPUTE'::"MandateType" THEN 'AN'::"Chamber"
        ELSE 'SENAT'::"Chamber"
      END
      AND v."votingDate" >= m."startDate"
      AND (m."endDate" IS NULL OR v."votingDate" <= m."endDate")
  `;
  if (targetVotes.length === 0) return null;

  const relevantPairs = [
    ...new Map(
      targetVotes.map((vote) => [`${vote.scrutinId}:${vote.groupId}`, vote] as const)
    ).values(),
  ];
  const relevantPairsJson = JSON.stringify(
    relevantPairs.map(({ scrutinId, groupId }) => ({ scrutinId, groupId }))
  );
  const groupVoteCounts =
    relevantPairs.length <= 500
      ? await db.$queryRaw<GroupVoteEntry[]>`
          WITH relevant_pairs AS MATERIALIZED (
            SELECT pair."scrutinId", pair."groupId"
            FROM jsonb_to_recordset(${relevantPairsJson}::jsonb)
              AS pair("scrutinId" text, "groupId" text)
          ), relevant_groups AS MATERIALIZED (
            SELECT DISTINCT "groupId"
            FROM relevant_pairs
          ), group_members AS MATERIALIZED (
            SELECT
              m."politicianId",
              m.type,
              m."startDate",
              m."endDate",
              mp."parliamentaryGroupId" as "groupId"
            FROM relevant_groups rg
            JOIN "MandateParliamentary" mp ON mp."parliamentaryGroupId" = rg."groupId"
            JOIN "Mandate" m ON m.id = mp."mandateId"
            WHERE m."isCurrent" = true
              AND m.type IN ('DEPUTE'::"MandateType", 'SENATEUR'::"MandateType")
          )
          SELECT
            v."scrutinId",
            m."groupId",
            v.position,
            COUNT(*)::int as count
          FROM "Vote" v
          JOIN relevant_pairs rp ON rp."scrutinId" = v."scrutinId"
          JOIN group_members m
            ON m."politicianId" = v."politicianId"
            AND m."groupId" = rp."groupId"
          WHERE v.position IN ('POUR', 'CONTRE', 'ABSTENTION')
            AND v.chamber = CASE
              WHEN m.type = 'DEPUTE'::"MandateType" THEN 'AN'::"Chamber"
              ELSE 'SENAT'::"Chamber"
            END
            AND v."votingDate" >= m."startDate"
            AND (m."endDate" IS NULL OR v."votingDate" <= m."endDate")
          GROUP BY v."scrutinId", m."groupId", v.position
        `
      : await db.$queryRaw<GroupVoteEntry[]>`
          WITH relevant_pairs AS MATERIALIZED (
            SELECT pair."scrutinId", pair."groupId"
            FROM jsonb_to_recordset(${relevantPairsJson}::jsonb)
              AS pair("scrutinId" text, "groupId" text)
          ), relevant_groups AS MATERIALIZED (
            SELECT DISTINCT "groupId"
            FROM relevant_pairs
          ), group_members AS MATERIALIZED (
            SELECT
              m."politicianId",
              m.type,
              m."startDate",
              m."endDate",
              mp."parliamentaryGroupId" as "groupId"
            FROM relevant_groups rg
            JOIN "MandateParliamentary" mp ON mp."parliamentaryGroupId" = rg."groupId"
            JOIN "Mandate" m ON m.id = mp."mandateId"
            WHERE m."isCurrent" = true
              AND m.type IN ('DEPUTE'::"MandateType", 'SENATEUR'::"MandateType")
          ), applicable_group_votes AS MATERIALIZED (
            SELECT
              v."scrutinId",
              m."groupId",
              v.position
            FROM group_members m
            JOIN "Vote" v ON v."politicianId" = m."politicianId"
            WHERE v.position IN ('POUR', 'CONTRE', 'ABSTENTION')
              AND v.chamber = CASE
                WHEN m.type = 'DEPUTE'::"MandateType" THEN 'AN'::"Chamber"
                ELSE 'SENAT'::"Chamber"
              END
              AND v."votingDate" >= m."startDate"
              AND (m."endDate" IS NULL OR v."votingDate" <= m."endDate")
          )
          SELECT
            v."scrutinId",
            v."groupId",
            v.position,
            COUNT(*)::int as count
          FROM applicable_group_votes v
          JOIN relevant_pairs rp
            ON rp."scrutinId" = v."scrutinId"
            AND rp."groupId" = v."groupId"
          GROUP BY v."scrutinId", v."groupId", v.position
        `;
  const result = computePoliticianDissidence(targetVotes, findGroupMajority(groupVoteCounts)).get(
    politicianId
  );

  return result
    ? {
        count: result.dissidenceCount,
        total: result.dissidenceTotal,
        rate: result.dissidenceRate,
      }
    : null;
}
