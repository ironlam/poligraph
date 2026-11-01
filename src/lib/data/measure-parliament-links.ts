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
import {
  chartGroups,
  isCandidateGroupAttested,
  isWholeTextVote,
} from "@/lib/measures/final-vote-groups";
import { groupAtDate, type MandateWindow } from "@/lib/measures/group-at-date";
import { getScrutinOfficialGroups } from "@/lib/data/scrutin-official-groups";
import { officialGroupCountsView } from "@/lib/votes/scrutin-provenance";

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
              legislature: true,
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
                    select: {
                      id: true,
                      code: true,
                      name: true,
                      shortName: true,
                      color: true,
                      chamber: true,
                      legislature: true,
                    },
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

  // A FINAL scrutin may be a budget-section vote: keep the whole-text votes only.
  const wholeTextVotes = links.map((l) =>
    l.dossier.scrutins.filter((s) => isWholeTextVote(s.title))
  );
  const scrutinIds = wholeTextVotes.flatMap((list) => list.map((s) => s.id));

  // Official count by group first (AN), read once per scrutin.
  const officialByScrutin = new Map<string, Awaited<ReturnType<typeof getScrutinOfficialGroups>>>();
  await Promise.all(
    wholeTextVotes.flat().flatMap((s) =>
      s.chamber === "AN"
        ? [
            getScrutinOfficialGroups(s.id, s.legislature).then((o) => {
              officialByScrutin.set(s.id, o);
            }),
          ]
        : []
    )
  );
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
                  parliamentaryGroup: {
                    select: { id: true, code: true, name: true, chamber: true, legislature: true },
                  },
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

  return links.flatMap((link, index) => {
    const { dossier } = link;
    if (!dossier.slug) return [];
    return [
      {
        dossierSlug: dossier.slug,
        title: dossier.shortTitle ?? dossier.title,
        status: dossier.status,
        linkKind: link.linkKind,
        finalVotes: (wholeTextVotes[index] ?? []).flatMap((s) => {
          if (!s.slug) return [];
          const mandateGroup = groupAtDate(windows, s.chamber, s.votingDate);
          const group =
            mandateGroup && isCandidateGroupAttested(s, mandateGroup) ? mandateGroup : null;
          const official = officialByScrutin.get(s.id);
          const groups = chartGroups({
            scrutin: s,
            computed: s.groupPositions,
            official: official
              ? officialGroupCountsView({
                  snapshot: official.snapshot,
                  organes: official.organes,
                  scrutin: s,
                })
              : null,
          });
          const mine = group
            ? groups.find((g) => g.code === group.code || g.shortName === group.code)
            : undefined;
          const groupPosition = mine?.position ?? null;
          return [
            {
              slug: s.slug,
              title: s.title,
              votingDate: s.votingDate,
              chamber: s.chamber,
              result: s.result,
              counts: { for: s.votesFor, against: s.votesAgainst, abstain: s.votesAbstain },
              groups,
              candidateVote: voteByScrutin.get(s.id) ?? null,
              candidateGroup: group
                ? { code: mine?.code ?? group.code, name: group.name, position: groupPosition }
                : null,
            },
          ];
        }),
      },
    ];
  });
}
