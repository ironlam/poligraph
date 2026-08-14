import { Prisma } from "@/generated/prisma";

export const DISSIDENCE_POSITIONS = ["POUR", "CONTRE", "ABSTENTION"] as const;

export function isDissidencePosition(position: string): boolean {
  return DISSIDENCE_POSITIONS.some((candidate) => candidate === position);
}

/** Shared joins for every current-mandate dissidence computation. */
export const CURRENT_GROUP_VOTES_JOINS = Prisma.sql`
  JOIN "Mandate" m ON m."politicianId" = v."politicianId"
    AND m."isCurrent" = true
    AND m.type IN ('DEPUTE'::"MandateType", 'SENATEUR'::"MandateType")
  JOIN "MandateParliamentary" mp ON mp."mandateId" = m.id
`;

/** Shared applicability predicate for every current-mandate dissidence computation. */
export const CURRENT_GROUP_VOTES_PREDICATE = Prisma.sql`
  v.position IN ('POUR', 'CONTRE', 'ABSTENTION')
    AND v.chamber = CASE
      WHEN m.type = 'DEPUTE'::"MandateType" THEN 'AN'::"Chamber"
      ELSE 'SENAT'::"Chamber"
    END
    AND v."votingDate" >= m."startDate"
    AND (m."endDate" IS NULL OR v."votingDate" <= m."endDate")
`;

/**
 * Shared FROM/JOIN/WHERE for BOTH dissidence scans (compute-stats.ts): the group
 * majority aggregation AND the per-politician vote scan. Both MUST run on the same
 * vote population. Past bug: the majority query lacked the mandate date filter, so
 * out-of-mandate votes polluted the majority (333 (scrutin, group) majorities
 * flipped, ~140 politicians judged against a wrong majority). Single source of truth.
 */
export const CURRENT_GROUP_VOTES_FROM = Prisma.sql`
  FROM "Vote" v
  ${CURRENT_GROUP_VOTES_JOINS}
  WHERE ${CURRENT_GROUP_VOTES_PREDICATE}
`;

export interface GroupVoteEntry {
  scrutinId: string;
  groupId: string;
  position: string;
  count: number;
}

export interface PoliticianVoteWithGroup {
  politicianId: string;
  scrutinId: string;
  groupId: string;
  position: string;
}

export interface DissidenceResult {
  dissidenceCount: number;
  dissidenceTotal: number;
  dissidenceRate: number;
}

export interface GroupDissidenceAgg {
  groupId: string;
  groupCode: string;
  groupName: string;
  groupColor: string | null;
  groupChamber: string;
  avgDissidenceRate: number;
  memberCount: number;
}

/**
 * Find the majority position for each (scrutinId, groupId) pair.
 * Returns Map keyed by "scrutinId:groupId" -> majority position.
 * On tie, picks alphabetically first position (deterministic).
 */
export function findGroupMajority(entries: GroupVoteEntry[]): Map<string, string> {
  const grouped = new Map<string, { position: string; count: number }[]>();
  for (const e of entries) {
    if (!isDissidencePosition(e.position)) continue;
    const key = `${e.scrutinId}:${e.groupId}`;
    const arr = grouped.get(key) ?? [];
    arr.push({ position: e.position, count: e.count });
    grouped.set(key, arr);
  }
  const result = new Map<string, string>();
  for (const [key, positions] of grouped) {
    positions.sort((a, b) => b.count - a.count || a.position.localeCompare(b.position));
    const top = positions[0];
    if (top) result.set(key, top.position);
  }
  return result;
}

/**
 * For each politician, count how many votes differ from group majority.
 * Only counts votes where a group majority exists.
 */
export function computePoliticianDissidence(
  votes: PoliticianVoteWithGroup[],
  groupMajority: Map<string, string>
): Map<string, DissidenceResult> {
  const stats = new Map<string, { dissident: number; total: number }>();
  for (const v of votes) {
    if (!isDissidencePosition(v.position)) continue;
    const key = `${v.scrutinId}:${v.groupId}`;
    const majority = groupMajority.get(key);
    if (!majority) continue;
    const s = stats.get(v.politicianId) ?? { dissident: 0, total: 0 };
    s.total++;
    if (v.position !== majority) s.dissident++;
    stats.set(v.politicianId, s);
  }
  const result = new Map<string, DissidenceResult>();
  for (const [id, s] of stats) {
    if (s.total === 0) continue;
    result.set(id, {
      dissidenceCount: s.dissident,
      dissidenceTotal: s.total,
      dissidenceRate: Math.round((s.dissident / s.total) * 1000) / 10,
    });
  }
  return result;
}

/**
 * Aggregate dissidence rates by parliamentary group.
 * Filters groups with < 3 members.
 */
export function aggregateDissidenceByGroup(
  data: {
    groupId: string | null;
    groupCode: string | null;
    groupName: string | null;
    groupColor: string | null;
    groupChamber: string;
    dissidenceRate: number | null;
  }[]
): GroupDissidenceAgg[] {
  const groupMap = new Map<
    string,
    { rates: number[]; code: string; name: string; color: string | null; chamber: string }
  >();
  for (const r of data) {
    if (!r.groupId || r.dissidenceRate == null) continue;
    if (!groupMap.has(r.groupId)) {
      groupMap.set(r.groupId, {
        rates: [],
        code: r.groupCode || "",
        name: r.groupName || "",
        color: r.groupColor,
        chamber: r.groupChamber,
      });
    }
    groupMap.get(r.groupId)!.rates.push(r.dissidenceRate);
  }
  return [...groupMap.entries()]
    .filter(([, v]) => v.rates.length >= 3)
    .map(([groupId, v]) => ({
      groupId,
      groupCode: v.code,
      groupName: v.name,
      groupColor: v.color,
      groupChamber: v.chamber,
      avgDissidenceRate:
        Math.round((v.rates.reduce((a, b) => a + b, 0) / v.rates.length) * 10) / 10,
      memberCount: v.rates.length,
    }))
    .sort((a, b) => a.avgDissidenceRate - b.avgDissidenceRate);
}
