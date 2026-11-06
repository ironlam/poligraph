import { cacheTag, cacheLife } from "next/cache";
import { db } from "@/lib/db";
import { PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";
import {
  filterReliableGroupPositions,
  isAnalysisPublishable,
  isGroupStatsPublishable,
} from "@/lib/votes/group-attribution";
import { CURRENT_LEGISLATURE } from "@/config/scrutin-importance";
import {
  parseReasons,
  type Reason,
  type ReasonQuote,
  type ReasonsPayload,
} from "@/services/scrutin-substance/reasons";
import type { GroupPosition, Chamber } from "@/generated/prisma";
import { getParliamentaryGroupConfig } from "@/config/parliamentaryGroups";
import {
  getGovernmentProjectPositionDataset,
  type GovernmentProjectGroupSummary,
  type GovernmentProjectPositionDataset,
} from "@/lib/data/government-project-positions";

export interface ScrutinGroupPositionData {
  id: string;
  position: GroupPosition;
  forCount: number;
  againstCount: number;
  abstainCount: number;
  cohesionPct: number;
  group: {
    id: string;
    code: string;
    name: string;
    shortName: string | null;
    color: string | null;
    slug: string | null;
  };
}

export async function getScrutinGroupPositions(
  scrutinId: string
): Promise<ScrutinGroupPositionData[]> {
  "use cache";
  cacheTag("votes");
  cacheLife("synced");

  const rows = await db.scrutinGroupPosition.findMany({
    where: { scrutinId },
    include: {
      group: {
        select: {
          id: true,
          code: true,
          name: true,
          shortName: true,
          color: true,
          slug: true,
          chamber: true,
          legislature: true,
        },
      },
      scrutin: { select: { chamber: true, legislature: true } },
    },
    orderBy: [{ position: "asc" }, { forCount: "desc" }],
  });
  return toPublicGroupPositions(rows);
}

/**
 * Écarte les positions dont le groupe n'est pas celui de la législature du scrutin
 * (voir group-attribution.ts) et retire les champs de contrôle du contrat public.
 */
function toPublicGroupPositions<
  T extends ScrutinGroupPositionData & {
    scrutin: { chamber: Chamber; legislature: number };
    group: ScrutinGroupPositionData["group"] & { chamber: Chamber; legislature: number | null };
  },
>(rows: T[]) {
  return filterReliableGroupPositions(rows).map(
    ({ scrutin: _scrutin, group: { chamber: _c, legislature: _l, ...group }, ...rest }) => ({
      ...rest,
      group,
    })
  );
}

export function groupPositionsByScrutinId(
  rows: (ScrutinGroupPositionData & { scrutinId: string })[]
): Map<string, ScrutinGroupPositionData[]> {
  const map = new Map<string, ScrutinGroupPositionData[]>();
  for (const row of rows) {
    const { scrutinId, ...rest } = row;
    const bucket = map.get(scrutinId);
    if (bucket) bucket.push(rest);
    else map.set(scrutinId, [rest]);
  }
  return map;
}

export async function getScrutinGroupPositionsBatch(
  scrutinIds: string[]
): Promise<Map<string, ScrutinGroupPositionData[]>> {
  "use cache";
  cacheTag("votes");
  cacheLife("synced");

  if (scrutinIds.length === 0) return new Map();

  const rows = await db.scrutinGroupPosition.findMany({
    where: { scrutinId: { in: scrutinIds } },
    include: {
      group: {
        select: {
          id: true,
          code: true,
          name: true,
          shortName: true,
          color: true,
          slug: true,
          chamber: true,
          legislature: true,
        },
      },
      scrutin: { select: { chamber: true, legislature: true } },
    },
    orderBy: [{ position: "asc" }, { forCount: "desc" }],
  });
  return groupPositionsByScrutinId(toPublicGroupPositions(rows));
}

export interface ReasonSpeakerView {
  name: string;
  /** Slug of the public politician sheet, when the speaker is matched to one. */
  slug: string | null;
  /** Current parliamentary group (not dated to the vote). Null for ministers. */
  groupCode: string | null;
  groupName: string | null;
  /** Speaking as a member of the Government (the role comes from the transcript). */
  government: boolean;
  role: string | null;
}
export interface ReasonView {
  text: string;
  shared: boolean;
  speakers: ReasonSpeakerView[];
  quotes: ReasonQuote[];
}
export interface ReasonsView {
  for: ReasonView[];
  against: ReasonView[];
}

export interface ScrutinAnalysisData {
  sourceUrl?: string | null;
  commonDiscussion?: boolean;
  argumentsFor: string;
  argumentsAgainst: string;
  sourceType: string;
  modelVersion: string;
  /** Structured reasons, absent on analyses written before they existed. */
  reasons?: ReasonsView | null;
}

const GOVERNMENT_ROLE = /ministre|secr[ée]taire d['’]état|garde des sceaux|premier ministre/i;

/** Find the public politician sheet and current group of each speaker, by the official
 * actor id. A speaker without a public sheet stays listed, without a link. */
async function resolveReasons(payload: ReasonsPayload): Promise<ReasonsView> {
  const refs = [...payload.for, ...payload.against].flatMap((r) =>
    r.speakers.flatMap((sp) => (sp.actorRef ? [sp.actorRef] : []))
  );
  const rows = refs.length
    ? await db.externalId.findMany({
        where: {
          source: "ASSEMBLEE_NATIONALE",
          externalId: { in: [...new Set(refs)] },
          politician: PUBLIC_POLITICIAN_WHERE,
        },
        select: {
          externalId: true,
          politician: {
            select: {
              slug: true,
              participation: { select: { groupCode: true, groupName: true } },
            },
          },
        },
      })
    : [];
  const byRef = new Map(rows.flatMap((r) => (r.politician ? [[r.externalId, r.politician]] : [])));
  const view = (r: Reason): ReasonView => ({
    text: r.text,
    shared: r.shared,
    quotes: r.quotes,
    speakers: r.speakers.map((sp) => {
      const pol = sp.actorRef ? byRef.get(sp.actorRef) : undefined;
      const government = !!sp.role && GOVERNMENT_ROLE.test(sp.role);
      return {
        name: sp.name,
        slug: pol?.slug ?? null,
        groupCode: government ? null : (pol?.participation?.groupCode ?? null),
        groupName: government ? null : (pol?.participation?.groupName ?? null),
        government,
        role: sp.role,
      };
    }),
  });
  return { for: payload.for.map(view), against: payload.against.map(view) };
}

export async function getScrutinAnalysis(scrutinId: string): Promise<ScrutinAnalysisData | null> {
  "use cache";
  cacheTag("votes");
  cacheLife("synced");

  const row = await db.scrutinAnalysis.findUnique({
    where: { scrutinId },
    select: {
      argumentsFor: true,
      argumentsAgainst: true,
      reasons: true,
      sourceType: true,
      modelVersion: true,
      sourceUrl: true,
      commonDiscussion: true,
      scrutin: { select: { chamber: true, legislature: true } },
    },
  });
  if (!row) return null;

  // Une analyse peut citer des groupes : on ne la publie pas pour une législature dont les
  // groupes ne sont pas attestés (group-attribution.ts).
  const { scrutin, reasons: storedReasons, ...analysis } = row;
  if (scrutin.chamber === "AN" && !analysis.sourceUrl) return null;
  if (!isAnalysisPublishable(scrutin, CURRENT_LEGISLATURE)) return null;
  const parsed = parseReasons(storedReasons);
  return { ...analysis, reasons: parsed ? await resolveReasons(parsed) : null };
}

export interface GroupListingItem {
  id: string;
  code: string;
  name: string;
  shortName: string | null;
  color: string | null;
  slug: string | null;
  chamber: Chamber;
  politicalPosition: string | null;
  seatCount: number;
  stats: {
    cohesionPct: number;
    governmentAlignmentPct: number;
    finalVoteAlignmentPct: number;
    averageParticipationPct: number | null;
  } | null;
  governmentProjectPositions: GovernmentProjectGroupSummary | null;
}

export async function getGroupesListing(
  options: {
    chamber?: Chamber;
    legislature?: number;
    includeGovernmentProjectPositions?: boolean;
  } = {}
): Promise<GroupListingItem[]> {
  "use cache";
  cacheTag("votes", "groupes");
  cacheLife("synced");

  const { chamber, legislature = 17, includeGovernmentProjectPositions = false } = options;

  const governmentProjectsPromise: Promise<GovernmentProjectPositionDataset> =
    !includeGovernmentProjectPositions || chamber === "SENAT"
      ? Promise.resolve({ legislature, groups: {} })
      : getGovernmentProjectPositionDataset(legislature);
  const [groups, governmentProjects] = await Promise.all([
    db.parliamentaryGroup.findMany({
      where: {
        ...(chamber && { chamber }),
        // AN groups have legislature set; Senate groups don't (staggered renewals)
        OR: [{ legislature }, { legislature: null }],
      },
      include: {
        stats: {
          take: 1,
          orderBy: { computedAt: "desc" },
        },
        _count: {
          select: {
            mandates: {
              where: {
                mandate: { isCurrent: true },
              },
            },
          },
        },
      },
      orderBy: { code: "asc" },
    }),
    governmentProjectsPromise,
  ]);

  return groups.map((g) => ({
    id: g.id,
    code: g.code,
    name: g.name,
    shortName: g.shortName,
    color: g.color,
    slug: g.slug,
    chamber: g.chamber,
    politicalPosition: g.politicalPosition,
    seatCount: g._count.mandates,
    stats:
      isGroupStatsPublishable(g.chamber) && g.stats[0]
        ? {
            cohesionPct: g.stats[0].cohesionPct,
            governmentAlignmentPct: g.stats[0].governmentAlignmentPct,
            finalVoteAlignmentPct: g.stats[0].finalVoteAlignmentPct,
            averageParticipationPct: null,
          }
        : null,
    governmentProjectPositions:
      g.chamber === "AN"
        ? (governmentProjects.groups[getParliamentaryGroupConfig(g.code, "AN")?.code ?? g.code]
            ?.summary ?? null)
        : null,
  }));
}

/** Top 5 votes where this group had a distinctive position (high cohesion). */
export async function getGroupKeyVotes(groupId: string, limit = 5) {
  "use cache";
  cacheTag("votes", "groupes");
  cacheLife("synced");

  // Un groupe AN n'atteste que les scrutins de sa propre législature (group-attribution.ts).
  const group = await db.parliamentaryGroup.findUnique({
    where: { id: groupId },
    select: { chamber: true, legislature: true },
  });
  if (!group) return [];
  if (group.chamber === "AN" && group.legislature === null) return [];

  return db.scrutinGroupPosition.findMany({
    where: {
      groupId,
      ...(group.chamber === "AN" && { scrutin: { legislature: group.legislature as number } }),
    },
    orderBy: { cohesionPct: "desc" },
    take: limit,
    include: {
      scrutin: {
        select: {
          id: true,
          externalId: true,
          slug: true,
          title: true,
          votingDate: true,
          legislature: true,
          chamber: true,
          votesFor: true,
          votesAgainst: true,
          votesAbstain: true,
          result: true,
          sourceUrl: true,
          theme: true,
          // Plan 6: public policy title (shown only when APPROVED + valid).
          policyTitle: {
            select: {
              status: true,
              policyTitle: true,
              policySubtitle: true,
              officialSourceUrl: true,
              proceduralLabel: true,
            },
          },
        },
      },
    },
  });
}

export async function getGroupeDetail(slug: string) {
  "use cache";
  cacheTag("votes", "groupes");
  cacheLife("synced");

  const group = await db.parliamentaryGroup.findUnique({
    where: { slug },
    include: {
      stats: { take: 1, orderBy: { computedAt: "desc" } },
      mandates: {
        where: { mandate: { isCurrent: true, politician: PUBLIC_POLITICIAN_WHERE } },
        include: {
          mandate: {
            include: {
              politician: {
                select: {
                  id: true,
                  slug: true,
                  firstName: true,
                  lastName: true,
                  fullName: true,
                  photoUrl: true,
                  blobPhotoUrl: true,
                  currentParty: { select: { shortName: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!group) return null;

  return {
    ...group,
    stats: isGroupStatsPublishable(group.chamber)
      ? group.stats.map((stats) => ({ ...stats, averageParticipationPct: null }))
      : [],
    seatCount: group.mandates.length,
    members: group.mandates.map((m) => m.mandate.politician),
  };
}
