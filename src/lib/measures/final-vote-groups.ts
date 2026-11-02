import type { Chamber, GroupPosition } from "@/generated/prisma";
import { getWholeBillKind } from "@/lib/scrutins/government-scope";
import { isGroupAttributionReliable } from "@/lib/votes/group-attribution";
import type { OfficialGroupCountsView } from "@/lib/votes/scrutin-provenance";

export interface ChartGroup {
  id: string;
  code: string;
  name: string;
  shortName: string | null;
  color: string | null;
  position: GroupPosition;
  size: number;
}

interface ComputedRow {
  position: GroupPosition;
  forCount: number;
  againstCount: number;
  abstainCount: number;
  group: {
    id: string;
    code: string;
    name: string;
    shortName: string | null;
    color: string | null;
    chamber: Chamber;
    legislature: number | null;
  };
}

/**
 * A scrutin typed FINAL can also be a vote on one budget section: only a vote titled "L'ensemble
 * du projet / de la proposition de loi" speaks for the whole text.
 */
export function isWholeTextVote(title: string): boolean {
  return getWholeBillKind(title) !== null;
}

/**
 * Groups to draw for one final vote. The official count by group wins when it is shown (AN only).
 * Otherwise the computed positions are kept only where the group belongs to the scrutin's
 * legislature, because they are computed from today's groups (see group-attribution.ts).
 */
export function chartGroups(input: {
  scrutin: { chamber: Chamber; legislature: number };
  computed: ComputedRow[];
  official: OfficialGroupCountsView | null;
}): ChartGroup[] {
  const { scrutin, computed, official } = input;
  if (official?.kind === "shown") {
    return official.rows.flatMap((row) =>
      row.majorityPosition
        ? [
            {
              id: row.organeRef,
              code: row.abbreviation ?? row.label,
              name: row.label,
              shortName: row.abbreviation,
              color: null,
              position: row.majorityPosition,
              size: row.memberCount ?? row.forCount + row.againstCount + row.abstainCount,
            },
          ]
        : []
    );
  }
  return computed
    .filter((row) => isGroupAttributionReliable(scrutin, row.group))
    .map((row) => ({
      id: row.group.id,
      code: row.group.code,
      name: row.group.name,
      shortName: row.group.shortName,
      color: row.group.color,
      position: row.position,
      size: row.forCount + row.againstCount + row.abstainCount,
    }))
    .toSorted((l, r) => r.size - l.size);
}

/** The candidate's group is named only when it belongs to the scrutin's legislature. */
export function isCandidateGroupAttested(
  scrutin: { chamber: Chamber; legislature: number },
  group: { chamber: Chamber; legislature: number | null }
): boolean {
  return isGroupAttributionReliable(scrutin, group);
}
