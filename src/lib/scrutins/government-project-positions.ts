export const GOVERNMENT_PROJECT_POSITIONS = ["POUR", "ABSTENTION", "CONTRE"] as const;

export type GovernmentProjectPosition = (typeof GOVERNMENT_PROJECT_POSITIONS)[number];

export type GovernmentProjectPositionExclusion =
  | "GROUP_REFERENCE_MISSING"
  | "GROUP_SNAPSHOT_MISSING"
  | "GROUP_SNAPSHOT_AMBIGUOUS"
  | "SOURCE_DIAGNOSTIC"
  | "COUNTS_INCOMPLETE"
  | "POSITION_TIE"
  | "MAJORITY_MISMATCH";

export type OfficialGroupTotalsExclusion =
  | "OFFICIAL_GROUPS_MISSING"
  | "OFFICIAL_GROUP_TOTALS_INCOMPLETE"
  | "OFFICIAL_GROUP_TOTALS_MISMATCH";

export interface OfficialGroupPositionInput {
  organeRef: string | null;
  forCount: number | null;
  againstCount: number | null;
  abstainCount: number | null;
  majorityPosition: string | null;
  issues: unknown;
}

export interface GovernmentProjectPositionResult {
  position: GovernmentProjectPosition | null;
  exclusion: GovernmentProjectPositionExclusion | null;
  forCount: number | null;
  againstCount: number | null;
  abstainCount: number | null;
}

export interface GovernmentProjectPositionSummary {
  consideredCount: number;
  excludedCount: number;
  counts: Record<GovernmentProjectPosition, number>;
  percentages: Record<GovernmentProjectPosition, number | null>;
}

function hasRelevantDiagnostics(value: unknown): boolean {
  if (!Array.isArray(value)) return value !== null && value !== undefined;
  return value.some(
    (issue) =>
      typeof issue !== "string" ||
      ["organeRef:", "vote:", "decompteVoix:", "forCount:", "againstCount:", "abstainCount:"].some(
        (prefix) => issue.startsWith(prefix)
      )
  );
}

function normalizedMajorityPosition(value: string | null): GovernmentProjectPosition | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return GOVERNMENT_PROJECT_POSITIONS.includes(normalized as GovernmentProjectPosition)
    ? (normalized as GovernmentProjectPosition)
    : null;
}

export function getDominantGovernmentProjectPosition(counts: {
  forCount: number;
  againstCount: number;
  abstainCount: number;
}): GovernmentProjectPosition | null {
  const values: Array<[GovernmentProjectPosition, number]> = [
    ["POUR", counts.forCount],
    ["ABSTENTION", counts.abstainCount],
    ["CONTRE", counts.againstCount],
  ];
  const maximum = Math.max(...values.map(([, count]) => count));
  const leaders = values.filter(([, count]) => count === maximum);
  return leaders.length === 1 ? leaders[0]![0] : null;
}

export function evaluateOfficialGroupPosition(
  rows: OfficialGroupPositionInput[],
  expectedOrganeRefs: string[]
): GovernmentProjectPositionResult {
  const empty = {
    position: null,
    forCount: null,
    againstCount: null,
    abstainCount: null,
  } as const;
  if (expectedOrganeRefs.length === 0) {
    return { ...empty, exclusion: "GROUP_REFERENCE_MISSING" };
  }
  const matches = rows.filter(
    (row) => row.organeRef !== null && expectedOrganeRefs.includes(row.organeRef)
  );
  if (matches.length === 0) return { ...empty, exclusion: "GROUP_SNAPSHOT_MISSING" };
  if (matches.length > 1) return { ...empty, exclusion: "GROUP_SNAPSHOT_AMBIGUOUS" };

  const row = matches[0]!;
  const counts = {
    forCount: row.forCount,
    againstCount: row.againstCount,
    abstainCount: row.abstainCount,
  };
  if (hasRelevantDiagnostics(row.issues))
    return { ...counts, position: null, exclusion: "SOURCE_DIAGNOSTIC" };
  if (Object.values(counts).some((count) => count === null)) {
    return { ...counts, position: null, exclusion: "COUNTS_INCOMPLETE" };
  }

  const position = getDominantGovernmentProjectPosition({
    forCount: counts.forCount!,
    againstCount: counts.againstCount!,
    abstainCount: counts.abstainCount!,
  });
  if (!position) return { ...counts, position: null, exclusion: "POSITION_TIE" };

  const sourcePosition = normalizedMajorityPosition(row.majorityPosition);
  if (sourcePosition && sourcePosition !== position) {
    return { ...counts, position: null, exclusion: "MAJORITY_MISMATCH" };
  }
  return { ...counts, position, exclusion: null };
}

export function validateOfficialGroupTotals(
  rows: OfficialGroupPositionInput[],
  totals: { votesFor: number; votesAgainst: number; votesAbstain: number }
): OfficialGroupTotalsExclusion | null {
  if (rows.length === 0) return "OFFICIAL_GROUPS_MISSING";
  if (
    rows.some(
      (row) => row.forCount === null || row.againstCount === null || row.abstainCount === null
    )
  ) {
    return "OFFICIAL_GROUP_TOTALS_INCOMPLETE";
  }
  const sums = rows.reduce(
    (result, row) => ({
      votesFor: result.votesFor + row.forCount!,
      votesAgainst: result.votesAgainst + row.againstCount!,
      votesAbstain: result.votesAbstain + row.abstainCount!,
    }),
    { votesFor: 0, votesAgainst: 0, votesAbstain: 0 }
  );
  return sums.votesFor === totals.votesFor &&
    sums.votesAgainst === totals.votesAgainst &&
    sums.votesAbstain === totals.votesAbstain
    ? null
    : "OFFICIAL_GROUP_TOTALS_MISMATCH";
}

export function summarizeGovernmentProjectPositions(
  results: GovernmentProjectPositionResult[]
): GovernmentProjectPositionSummary {
  const counts: Record<GovernmentProjectPosition, number> = {
    POUR: 0,
    ABSTENTION: 0,
    CONTRE: 0,
  };
  for (const result of results) {
    if (result.position) counts[result.position] += 1;
  }
  const consideredCount = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return {
    consideredCount,
    excludedCount: results.length - consideredCount,
    counts,
    percentages: {
      POUR: consideredCount === 0 ? null : (counts.POUR / consideredCount) * 100,
      ABSTENTION: consideredCount === 0 ? null : (counts.ABSTENTION / consideredCount) * 100,
      CONTRE: consideredCount === 0 ? null : (counts.CONTRE / consideredCount) * 100,
    },
  };
}
