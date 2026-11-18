/** What ListCard reads from a candidacy. Kept in step with its `members` prop. */
export interface ListCardMember {
  id: string;
  candidateName: string;
  listPosition: number | null;
  candidate: { gender: string | null } | null;
  politician: {
    id: string;
    slug: string;
    fullName: string;
    photoUrl: string | null;
    blobPhotoUrl: string | null;
    currentParty: { shortName: string; color: string | null } | null;
    mandates: Array<{ type: string }>;
  } | null;
  participationRate?: number | null;
  affairsCount?: number;
}

/**
 * Narrows a candidacy row to the fields ListCard renders.
 *
 * ListCard is a client component: every key of its props is serialised into the page, read or
 * not. The rows come from a Prisma `include`, so the whole candidacy and candidate records went
 * along (dates, source URLs, results). On a commune with nine lists of 163 names that was 1.4 MB
 * of a 1.7 MB document.
 */
export function toListCardMember(member: ListCardMember): ListCardMember {
  return {
    id: member.id,
    candidateName: member.candidateName,
    listPosition: member.listPosition,
    candidate: member.candidate ? { gender: member.candidate.gender } : null,
    politician: member.politician,
    participationRate: member.participationRate,
    affairsCount: member.affairsCount,
  };
}
