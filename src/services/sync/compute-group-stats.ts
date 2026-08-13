import { db } from "@/lib/db";
import {
  GOVERNMENT_GROUP_CODE,
  SENATE_GOVERNMENT_GROUP_CODE,
  CURRENT_LEGISLATURE,
  CURRENT_SENATE_SESSION,
} from "@/config/scrutin-importance";
import type { Chamber, ScrutinType } from "@/generated/prisma";

export function computeAverageCohesion(positions: Array<{ cohesionPct: number }>): number {
  if (positions.length === 0) return 0;
  const sum = positions.reduce((acc, p) => acc + p.cohesionPct, 0);
  return Math.round((sum / positions.length) * 10) / 10;
}

export function computeGovernmentAlignment(params: {
  groupPositions: Array<{ scrutinId: string; position: string }>;
  govGroupPositions: Array<{ scrutinId: string; position: string }>;
}): number {
  const { groupPositions, govGroupPositions } = params;
  if (govGroupPositions.length === 0) return 0;

  const govMap = new Map(govGroupPositions.map((p) => [p.scrutinId, p.position]));
  let matching = 0;
  let total = 0;

  for (const gp of groupPositions) {
    const govPos = govMap.get(gp.scrutinId);
    if (govPos === undefined) continue;
    total++;
    if (gp.position === govPos) matching++;
  }

  return total > 0 ? Math.round((matching / total) * 1000) / 10 : 0;
}

interface TypedAlignmentPosition {
  scrutinId: string;
  position: string;
  scrutin: { type: ScrutinType | null };
}

export function computeAlignmentRates(params: {
  groupPositions: TypedAlignmentPosition[];
  govGroupPositions: TypedAlignmentPosition[];
}): {
  governmentAlignmentPct: number;
  finalVoteAlignmentPct: number;
} {
  const { groupPositions, govGroupPositions } = params;
  const finalGroupPositions = groupPositions.filter(
    (position) => position.scrutin.type === "FINAL"
  );
  const finalGovGroupPositions = govGroupPositions.filter(
    (position) => position.scrutin.type === "FINAL"
  );

  return {
    governmentAlignmentPct: computeGovernmentAlignment({
      groupPositions,
      govGroupPositions,
    }),
    finalVoteAlignmentPct: computeGovernmentAlignment({
      groupPositions: finalGroupPositions,
      govGroupPositions: finalGovGroupPositions,
    }),
  };
}

interface ChamberConfig {
  govGroupCode: string;
  statsLegislature: number;
  groupFilter: { chamber: Chamber; legislature: number } | { chamber: Chamber; legislature: null };
}

const CHAMBER_CONFIGS: ChamberConfig[] = [
  {
    govGroupCode: GOVERNMENT_GROUP_CODE,
    statsLegislature: CURRENT_LEGISLATURE,
    groupFilter: { chamber: "AN", legislature: CURRENT_LEGISLATURE },
  },
  {
    govGroupCode: SENATE_GOVERNMENT_GROUP_CODE,
    statsLegislature: CURRENT_SENATE_SESSION,
    groupFilter: { chamber: "SENAT", legislature: null },
  },
];

async function computeForChamber(config: ChamberConfig): Promise<number> {
  const groups = await db.parliamentaryGroup.findMany({
    where: config.groupFilter,
    select: { id: true, code: true },
  });

  const govGroup = groups.find((g) => g.code === config.govGroupCode);
  const govPositions = govGroup
    ? await db.scrutinGroupPosition.findMany({
        where: { groupId: govGroup.id },
        select: {
          scrutinId: true,
          position: true,
          scrutin: { select: { type: true } },
        },
      })
    : [];

  for (const group of groups) {
    const positions = await db.scrutinGroupPosition.findMany({
      where: { groupId: group.id },
      select: {
        scrutinId: true,
        position: true,
        cohesionPct: true,
        scrutin: { select: { type: true } },
      },
    });

    const cohesionPct = computeAverageCohesion(positions);
    const { governmentAlignmentPct, finalVoteAlignmentPct } = computeAlignmentRates({
      groupPositions: positions,
      govGroupPositions: govPositions,
    });

    await db.parliamentaryGroupStats.upsert({
      where: {
        groupId_legislature: { groupId: group.id, legislature: config.statsLegislature },
      },
      create: {
        groupId: group.id,
        legislature: config.statsLegislature,
        cohesionPct,
        governmentAlignmentPct,
        finalVoteAlignmentPct,
        averageParticipationPct: null,
      },
      update: {
        cohesionPct,
        governmentAlignmentPct,
        finalVoteAlignmentPct,
        averageParticipationPct: null,
      },
    });
  }

  return groups.length;
}

export async function computeGroupStats(): Promise<{
  groupsProcessed: number;
}> {
  let total = 0;
  for (const config of CHAMBER_CONFIGS) {
    total += await computeForChamber(config);
  }
  return { groupsProcessed: total };
}
