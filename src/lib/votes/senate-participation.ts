import type { VotePosition } from "@/generated/prisma";
import { PARTICIPATION_METHOD_VERSION } from "@/lib/votes/participation-publication";

export const SENATE_VOTE_SOURCE_CODES = ["p", "c", "a", "n"] as const;
export type SenateVoteSourceCode = (typeof SENATE_VOTE_SOURCE_CODES)[number];

export interface SenateSourceVote {
  matricule: string;
  vote: string;
  siege: number;
}

export interface SenateOfficialVoteTotals {
  voters: number;
  nonVoters: number;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
}

export interface SenateVoteSourceAssessment {
  status: "COMPLETE" | "INCOMPLETE" | "INVALID";
  expectedCount: number;
  observedCount: number;
  reason: string | null;
}

const POSITION_BY_CODE: Record<SenateVoteSourceCode, VotePosition> = {
  p: "POUR",
  c: "CONTRE",
  a: "ABSTENTION",
  n: "NON_VOTANT",
};

export function isSenateVoteSourceCode(code: unknown): code is SenateVoteSourceCode {
  return (
    typeof code === "string" &&
    (SENATE_VOTE_SOURCE_CODES as readonly string[]).includes(code.toLowerCase())
  );
}

/** Strict mapping: an unknown official code must never become an absence. */
export function mapSenateVotePosition(code: string): VotePosition {
  const normalized = code.toLowerCase();
  if (!isSenateVoteSourceCode(normalized)) {
    throw new Error(`Code de vote Sénat inconnu: ${code}`);
  }
  return POSITION_BY_CODE[normalized];
}

/**
 * Validate the nominative JSON against the totals published on the official HTML page.
 * `nonVoters` means "n'a pas pris part au vote", never physical absence.
 */
export function assessSenateVoteSource(
  votes: SenateSourceVote[],
  official: SenateOfficialVoteTotals
): SenateVoteSourceAssessment {
  const expectedCount = official.voters + official.nonVoters;
  const observedCount = votes.length;

  if (
    !Number.isInteger(expectedCount) ||
    expectedCount <= 0 ||
    Object.values(official).some((value) => !Number.isInteger(value) || value < 0)
  ) {
    return { status: "INVALID", expectedCount, observedCount, reason: "official_totals_invalid" };
  }

  const malformedVote = votes.find(
    (vote) =>
      typeof vote.matricule !== "string" ||
      vote.matricule.trim() === "" ||
      !Number.isInteger(vote.siege) ||
      vote.siege <= 0 ||
      typeof vote.vote !== "string"
  );
  if (malformedVote) {
    return { status: "INVALID", expectedCount, observedCount, reason: "vote_row_invalid" };
  }

  const unknownCode = votes.find((vote) => !isSenateVoteSourceCode(vote.vote));
  if (unknownCode) {
    return {
      status: "INVALID",
      expectedCount,
      observedCount,
      reason: `unknown_vote_code:${unknownCode.vote}`,
    };
  }

  const uniqueMatricules = new Set(votes.map((vote) => vote.matricule));
  const uniqueSeats = new Set(votes.map((vote) => vote.siege));
  if (uniqueMatricules.size !== observedCount || uniqueSeats.size !== observedCount) {
    return { status: "INVALID", expectedCount, observedCount, reason: "duplicate_identity" };
  }

  if (observedCount !== expectedCount) {
    return { status: "INCOMPLETE", expectedCount, observedCount, reason: "row_count_mismatch" };
  }

  const counts = { p: 0, c: 0, a: 0, n: 0 };
  for (const vote of votes) counts[vote.vote.toLowerCase() as SenateVoteSourceCode]++;

  if (
    counts.p !== official.votesFor ||
    counts.c !== official.votesAgainst ||
    counts.a !== official.votesAbstain ||
    counts.p + counts.c + counts.a !== official.voters ||
    counts.n !== official.nonVoters
  ) {
    return { status: "INCOMPLETE", expectedCount, observedCount, reason: "totals_mismatch" };
  }

  return { status: "COMPLETE", expectedCount, observedCount, reason: null };
}

export interface SenateParticipationCounts {
  expressed: number;
  nonVoting: number;
  eligibleScrutins: number;
  recordedRows: number;
}

export interface SenateParticipationCandidate {
  votesCount: number;
  eligibleScrutins: number;
  participationRate: number;
}

export interface SenateParticipationAggregateInput extends SenateParticipationCandidate {
  partyId: string | null;
  partyName: string | null;
  partyShortName: string | null;
  partyColor: string | null;
  partySlug: string | null;
  groupId: string | null;
  groupName: string | null;
  groupCode: string | null;
  groupColor: string | null;
}

export interface SenateParticipationAggregate {
  id: string;
  name: string;
  shortName: string;
  color: string | null;
  slug: string | null;
  avgParticipationRate: number;
  memberCount: number;
  computationVersion: string;
}

/**
 * Return a candidate only when every officially complete eligible scrutin has one
 * mapped row for this senator. Missing identity coverage stays unknown, never 0%.
 */
export function computeSenateParticipationCandidate(
  counts: SenateParticipationCounts
): SenateParticipationCandidate | null {
  const { expressed, nonVoting, eligibleScrutins, recordedRows } = counts;
  if (
    ![expressed, nonVoting, eligibleScrutins, recordedRows].every(
      (value) => Number.isInteger(value) && value >= 0
    ) ||
    eligibleScrutins <= 0 ||
    recordedRows !== eligibleScrutins ||
    expressed + nonVoting !== recordedRows
  ) {
    return null;
  }

  return {
    votesCount: expressed,
    eligibleScrutins,
    participationRate: Math.round((expressed / eligibleScrutins) * 100),
  };
}

export function aggregateSenateParticipation(
  rows: SenateParticipationAggregateInput[],
  dimension: "party" | "group"
): SenateParticipationAggregate[] {
  const aggregates = new Map<
    string,
    {
      name: string;
      shortName: string;
      color: string | null;
      slug: string | null;
      rates: number[];
    }
  >();

  for (const row of rows) {
    const id = dimension === "party" ? row.partyId : row.groupId;
    if (!id) continue;
    const current = aggregates.get(id) ?? {
      name: (dimension === "party" ? row.partyName : row.groupName) ?? "",
      shortName: (dimension === "party" ? row.partyShortName : row.groupCode) ?? "",
      color: dimension === "party" ? row.partyColor : row.groupColor,
      slug: dimension === "party" ? row.partySlug : null,
      rates: [],
    };
    current.rates.push(row.participationRate);
    aggregates.set(id, current);
  }

  return [...aggregates.entries()]
    .filter(([, aggregate]) => aggregate.rates.length >= 3)
    .map(([id, aggregate]) => ({
      id,
      name: aggregate.name,
      shortName: aggregate.shortName,
      color: aggregate.color,
      slug: aggregate.slug,
      avgParticipationRate:
        Math.round(
          (aggregate.rates.reduce((sum, rate) => sum + rate, 0) / aggregate.rates.length) * 10
        ) / 10,
      memberCount: aggregate.rates.length,
      computationVersion: PARTICIPATION_METHOD_VERSION,
    }))
    .sort((a, b) => a.avgParticipationRate - b.avgParticipationRate || a.id.localeCompare(b.id));
}
