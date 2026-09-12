import "server-only";

import {
  PUBLIC_POLITICIAN_PUBLICATION_STATUS,
  PUBLIC_POLITICIAN_WHERE,
} from "@/lib/api/public-contract";
import { buildPaginationMeta, type PaginationResult } from "@/lib/api/pagination";
import type { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";

const ELECTION_DETAILS_SELECT = {
  id: true,
  publicId: true,
  slug: true,
  type: true,
  title: true,
  shortTitle: true,
  description: true,
  round1Date: true,
  round2Date: true,
  dateConfirmed: true,
  registrationDeadline: true,
  candidacyOpenDate: true,
  candidacyDeadline: true,
  campaignStartDate: true,
  decreeUrl: true,
  sourceUrl: true,
  scope: true,
  totalSeats: true,
  suffrage: true,
  status: true,
  featured: true,
  createdAt: true,
  updatedAt: true,
  rounds: {
    select: {
      round: true,
      date: true,
      registeredVoters: true,
      actualVoters: true,
      participationRate: true,
      blankVotes: true,
      nullVotes: true,
    },
    orderBy: { round: "asc" as const },
  },
  candidacies: {
    select: {
      id: true,
      candidateName: true,
      partyLabel: true,
      constituencyName: true,
      isElected: true,
      round1Votes: true,
      round1Pct: true,
      round2Votes: true,
      round2Pct: true,
      politician: {
        select: {
          id: true,
          slug: true,
          fullName: true,
          photoUrl: true,
          publicationStatus: true,
        },
      },
      party: {
        select: {
          id: true,
          slug: true,
          shortName: true,
          color: true,
          _count: {
            select: { politicians: { where: PUBLIC_POLITICIAN_WHERE } },
          },
        },
      },
    },
    orderBy: [
      { isElected: "desc" as const },
      { round1Pct: "desc" as const },
      { id: "asc" as const },
    ],
  },
} satisfies Prisma.ElectionSelect;

export const ELECTION_CANDIDACIES_DEFAULT_LIMIT = 20;
export const ELECTION_CANDIDACIES_MAX_LIMIT = 100;

/**
 * Public election details. Candidacies are deliberately a page, never an implicit full relation.
 * The count is computed by PostgreSQL and no candidacy row outside the requested page crosses the
 * database boundary.
 */
export async function getPublicElectionDetails(slug: string, pagination: PaginationResult) {
  const election = await db.election.findUnique({
    where: { slug },
    select: {
      ...ELECTION_DETAILS_SELECT,
      candidacies: {
        ...ELECTION_DETAILS_SELECT.candidacies,
        skip: pagination.skip,
        take: pagination.limit,
      },
    },
  });

  if (!election) return null;

  const total = await db.candidacy.count({ where: { electionId: election.id } });
  const { candidacies, ...electionDetails } = election;

  return {
    ...electionDetails,
    candidacies: {
      data: candidacies.map((candidacy) => ({
        ...candidacy,
        politician:
          candidacy.politician?.publicationStatus === PUBLIC_POLITICIAN_PUBLICATION_STATUS
            ? {
                id: candidacy.politician.id,
                slug: candidacy.politician.slug,
                fullName: candidacy.politician.fullName,
                photoUrl: candidacy.politician.photoUrl,
              }
            : null,
        party:
          candidacy.party && candidacy.party._count.politicians > 0
            ? {
                id: candidacy.party.id,
                slug: candidacy.party.slug,
                shortName: candidacy.party.shortName,
                color: candidacy.party.color,
              }
            : null,
      })),
      pagination: buildPaginationMeta(pagination.page, pagination.limit, total),
    },
  };
}
