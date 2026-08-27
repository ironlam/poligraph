import { db } from "@/lib/db";
import {
  computeSenateParticipationCandidate,
  type SenateParticipationAggregateInput,
} from "@/lib/votes/senate-participation";

interface RawSenateParticipationRow {
  politicianId: string;
  firstName: string;
  lastName: string;
  partyId: string | null;
  partyName: string | null;
  partyShortName: string | null;
  partyColor: string | null;
  partySlug: string | null;
  groupId: string | null;
  groupName: string | null;
  groupCode: string | null;
  groupColor: string | null;
  identityComplete: boolean;
  expressed: number;
  nonVoting: number;
  totalScrutins: number;
  eligibleScrutins: number;
  recordedRows: number;
}

export interface SenateParticipationAuditRow extends RawSenateParticipationRow {
  candidate: SenateParticipationAggregateInput | null;
}

/**
 * Read-only candidate computation. It is intentionally separate from every public
 * reader and persistent producer until production validation authorizes a cutover.
 */
export async function computeSenateParticipationAuditRows(): Promise<
  SenateParticipationAuditRow[]
> {
  const rows = await db.$queryRaw<RawSenateParticipationRow[]>`
    WITH unambiguous_current_senators AS (
      SELECT m."politicianId", MIN(m.id) AS "mandateId"
      FROM "Mandate" m
      WHERE m."isCurrent" = true
        AND m.type IN ('DEPUTE'::"MandateType", 'SENATEUR'::"MandateType")
      GROUP BY m."politicianId"
      HAVING COUNT(*) = 1
        AND COUNT(*) FILTER (WHERE m.type = 'SENATEUR'::"MandateType") = 1
    )
    SELECT
      pol.id AS "politicianId",
      pol."firstName",
      pol."lastName",
      p.id AS "partyId",
      p.name AS "partyName",
      p."shortName" AS "partyShortName",
      p.color AS "partyColor",
      p.slug AS "partySlug",
      pg.id AS "groupId",
      pg.name AS "groupName",
      pg.code AS "groupCode",
      pg.color AS "groupColor",
      EXISTS (
        SELECT 1
        FROM "ExternalId" eid
        WHERE eid."politicianId" = pol.id
          AND eid.source = 'SENAT'::"DataSource"
      ) AS "identityComplete",
      COUNT(v.id) FILTER (
        WHERE v.position IN ('POUR', 'CONTRE', 'ABSTENTION')
      )::int AS expressed,
      COUNT(v.id) FILTER (WHERE v.position = 'NON_VOTANT')::int AS "nonVoting",
      COUNT(s.id)::int AS "totalScrutins",
      COUNT(s.id) FILTER (WHERE svi.status = 'COMPLETE')::int AS "eligibleScrutins",
      COUNT(v.id)::int AS "recordedRows"
    FROM unambiguous_current_senators scope
    JOIN "Mandate" m ON m.id = scope."mandateId"
    JOIN "Politician" pol ON pol.id = m."politicianId"
    LEFT JOIN "Party" p ON p.id = pol."currentPartyId"
    LEFT JOIN "MandateParliamentary" mp ON mp."mandateId" = m.id
    LEFT JOIN "ParliamentaryGroup" pg ON pg.id = mp."parliamentaryGroupId"
    LEFT JOIN "Scrutin" s ON s.chamber = 'SENAT'::"Chamber"
      AND s."votingDate" >= m."startDate"
      AND (m."endDate" IS NULL OR s."votingDate" <= m."endDate")
    LEFT JOIN "ScrutinVoteImport" svi ON svi."scrutinId" = s.id
    LEFT JOIN "Vote" v ON v."scrutinId" = s.id
      AND v."politicianId" = pol.id
      AND svi.status = 'COMPLETE'::"IndividualVoteDataStatus"
    WHERE pol."publicationStatus" = 'PUBLISHED'
    GROUP BY pol.id, p.id, pg.id
    ORDER BY pol.id
  `;

  return rows.map((row) => {
    const sourcePeriodComplete = row.totalScrutins === row.eligibleScrutins;
    const computed =
      row.identityComplete && sourcePeriodComplete
        ? computeSenateParticipationCandidate(row)
        : null;
    return {
      ...row,
      candidate: computed
        ? {
            ...computed,
            partyId: row.partyId,
            partyName: row.partyName,
            partyShortName: row.partyShortName,
            partyColor: row.partyColor,
            partySlug: row.partySlug,
            groupId: row.groupId,
            groupName: row.groupName,
            groupCode: row.groupCode,
            groupColor: row.groupColor,
          }
        : null,
    };
  });
}
