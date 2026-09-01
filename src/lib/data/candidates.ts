import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";

const PRESIDENTIAL_INCLUDE = {
  politician: {
    select: {
      id: true,
      slug: true,
      fullName: true,
      photoUrl: true,
      publicationStatus: true,
      currentParty: { select: { id: true, slug: true, name: true, shortName: true, color: true } },
    },
  },
  party: { select: { id: true, slug: true, name: true, shortName: true, color: true } },
  election: { select: { id: true, slug: true, title: true, round1Date: true } },
  presidentialData: true,
} satisfies Prisma.CandidacyInclude;

export type CandidatePresidentialRow = Prisma.CandidacyGetPayload<{
  include: typeof PRESIDENTIAL_INCLUDE;
}>;

export async function getCandidates2027ForModeration(): Promise<CandidatePresidentialRow[]> {
  return db.candidacy.findMany({
    where: { election: { slug: "presidentielle-2027" } },
    include: PRESIDENTIAL_INCLUDE,
    orderBy: [
      { presidentialData: { rank: { sort: "asc", nulls: "last" } } },
      { politician: { lastName: "asc" } },
    ],
  });
}

export async function getCandidatePresidentialBySlug(
  electionSlug: string,
  politicianSlug: string
): Promise<CandidatePresidentialRow | null> {
  return db.candidacy.findFirst({
    where: {
      election: { slug: electionSlug },
      politician: { slug: politicianSlug },
    },
    include: PRESIDENTIAL_INCLUDE,
  });
}

export interface CrossCycleEntry {
  electionSlug: string;
  electionTitle: string;
  round1Date: Date | null;
  round1Pct: number | null;
}

export async function getCandidateCrossCycle(
  politicianId: string,
  excludeElectionSlug: string
): Promise<CrossCycleEntry[]> {
  const rows = await db.candidacy.findMany({
    where: {
      politicianId,
      election: { type: "PRESIDENTIELLE", slug: { not: excludeElectionSlug } },
    },
    include: {
      election: { select: { slug: true, title: true, round1Date: true } },
    },
    orderBy: { election: { round1Date: "desc" } },
  });
  return rows.map((r) => ({
    electionSlug: r.election.slug,
    electionTitle: r.election.title,
    round1Date: r.election.round1Date,
    round1Pct: r.round1Pct == null ? null : Number(r.round1Pct),
  }));
}

export async function getCandidateRound1Pct(candidacyId: string): Promise<number | null> {
  const candidacy = await db.candidacy.findUnique({
    where: { id: candidacyId },
    select: { round1Pct: true },
  });
  return candidacy?.round1Pct == null ? null : Number(candidacy.round1Pct);
}
