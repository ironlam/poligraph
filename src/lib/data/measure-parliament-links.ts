import "server-only";

import type {
  Chamber,
  DossierStatus,
  GroupPosition,
  MeasureDossierLinkKind,
  VotePosition,
  VotingResult,
} from "@/generated/prisma";
import { db } from "@/lib/db";
import { groupAtDate, type MandateWindow } from "@/lib/measures/group-at-date";

export type MeasureParliamentFinalVote = {
  slug: string;
  title: string;
  votingDate: Date;
  chamber: Chamber;
  result: VotingResult;
  counts: { for: number; against: number; abstain: number };
  /** Every group's majority position, to show where the candidate stood among the others. */
  groups: Array<{
    id: string;
    code: string;
    name: string;
    shortName: string | null;
    color: string | null;
    position: GroupPosition;
    size: number;
  }>;
  /** Vote of the candidate on this scrutin, only when one is recorded. */
  candidateVote: VotePosition | null;
  /** Group the candidate sat in on that date, with the group's majority position when known. */
  candidateGroup: { code: string; name: string; position: GroupPosition | null } | null;
};

export type MeasureParliamentLink = {
  dossierSlug: string;
  title: string;
  status: DossierStatus;
  linkKind: MeasureDossierLinkKind;
  finalVotes: MeasureParliamentFinalVote[];
};

/**
 * Reviewed links between a measure and legislative dossiers, for the revision currently published
 * only: a link reviewed against an older wording is never shown. The vote lines state positions on
 * the TEXT (final vote of the dossier), never on the measure itself.
 */
export async function getMeasureParliamentLinks(
  measureId: string,
  publishedRevisionId: string,
  politicianId: string
): Promise<MeasureParliamentLink[]> {
  const links = await db.measureDossierLink.findMany({
    where: {
      measureId,
      applicableRevisionId: publishedRevisionId,
      dossier: { slug: { not: null } },
    },
    orderBy: [{ linkKind: "asc" }, { checkedAt: "desc" }],
    select: {
      linkKind: true,
      dossier: {
        select: {
          slug: true,
          title: true,
          shortTitle: true,
          status: true,
          scrutins: {
            where: { type: "FINAL" },
            orderBy: [{ votingDate: "asc" }, { sequence: "asc" }],
            select: {
              id: true,
              slug: true,
              title: true,
              votingDate: true,
              chamber: true,
              result: true,
              votesFor: true,
              votesAgainst: true,
              votesAbstain: true,
              groupPositions: {
                select: {
                  groupId: true,
                  position: true,
                  forCount: true,
                  againstCount: true,
                  abstainCount: true,
                  group: {
                    select: { id: true, code: true, name: true, shortName: true, color: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (links.length === 0) return [];

  const scrutinIds = links.flatMap((l) => l.dossier.scrutins.map((s) => s.id));
  const [votes, mandates] =
    scrutinIds.length === 0
      ? [[], []]
      : await Promise.all([
          db.vote.findMany({
            where: { politicianId, scrutinId: { in: scrutinIds } },
            select: { scrutinId: true, position: true },
          }),
          db.mandate.findMany({
            where: {
              politicianId,
              type: { in: ["DEPUTE", "SENATEUR"] },
              parliamentaryData: { isNot: null },
            },
            select: {
              type: true,
              startDate: true,
              endDate: true,
              parliamentaryData: {
                select: {
                  parliamentaryGroup: { select: { id: true, code: true, name: true } },
                },
              },
            },
          }),
        ]);
  const voteByScrutin = new Map(votes.map((v) => [v.scrutinId, v.position]));
  const windows: MandateWindow[] = mandates.flatMap((m) =>
    m.parliamentaryData
      ? [
          {
            type: m.type,
            startDate: m.startDate,
            endDate: m.endDate,
            group: m.parliamentaryData.parliamentaryGroup,
          },
        ]
      : []
  );

  return links.flatMap((link) => {
    const { dossier } = link;
    if (!dossier.slug) return [];
    return [
      {
        dossierSlug: dossier.slug,
        title: dossier.shortTitle ?? dossier.title,
        status: dossier.status,
        linkKind: link.linkKind,
        finalVotes: dossier.scrutins.flatMap((s) => {
          if (!s.slug) return [];
          const group = groupAtDate(windows, s.chamber, s.votingDate);
          const groupPosition = group
            ? (s.groupPositions.find((p) => p.groupId === group.id)?.position ?? null)
            : null;
          return [
            {
              slug: s.slug,
              title: s.title,
              votingDate: s.votingDate,
              chamber: s.chamber,
              result: s.result,
              counts: { for: s.votesFor, against: s.votesAgainst, abstain: s.votesAbstain },
              groups: s.groupPositions
                .map((p) => ({
                  ...p.group,
                  position: p.position,
                  size: p.forCount + p.againstCount + p.abstainCount,
                }))
                .toSorted((l, r) => r.size - l.size),
              candidateVote: voteByScrutin.get(s.id) ?? null,
              candidateGroup: group
                ? { code: group.code, name: group.name, position: groupPosition }
                : null,
            },
          ];
        }),
      },
    ];
  });
}
