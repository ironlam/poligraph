/**
 * What the senatorial results import writes, decided without touching the database.
 *
 * A constituency is published only as a whole: filled according to the feed index, its
 * file actually published, and exactly as many elected people as statutory seats. Anything
 * else is skipped, so the hub never shows a department half filled.
 */

import { FEHF_SENATE_SEATS, getSenateSeatsAtStake } from "@/config/senate-seats";
import {
  FEHF_FEED_CODE,
  matchOutgoing,
  type FeedConstituencyResult,
  type FeedConstituencyStatus,
  type FeedElected,
} from "@/lib/senatoriales/results-feed";
import type { OutgoingSenateSeat } from "@/types/stats-snapshots";

export type SkipReason = "not-filled" | "not-published" | "seat-count-mismatch";

export type ConstituencyDecision =
  | { code: string; action: "skip"; reason: SkipReason }
  | { code: string; action: "replace"; elected: FeedElected[] };

export interface PlannedElected extends FeedElected {
  politicianId: string | null;
  /** Where `politicianId` comes from. */
  link: "outgoing" | "resolver" | "none";
}

/** Seats the 2026 ballot fills in this constituency, or null outside series 2. */
export function statutorySeatsFor(code: string): number | null {
  return code === FEHF_FEED_CODE ? FEHF_SENATE_SEATS[2] : getSenateSeatsAtStake(code);
}

export function planConstituency(
  status: FeedConstituencyStatus,
  result: FeedConstituencyResult | "not-published"
): ConstituencyDecision {
  const { code } = status;
  if (status.filled === "NON") return { code, action: "skip", reason: "not-filled" };
  if (result === "not-published") return { code, action: "skip", reason: "not-published" };
  const seats = statutorySeatsFor(code);
  if (
    seats === null ||
    result.elected.length !== seats ||
    result.seatsFilled !== result.seatsToFill ||
    result.seatsToFill !== seats
  ) {
    return { code, action: "skip", reason: "seat-count-mismatch" };
  }
  return { code, action: "replace", elected: result.elected };
}

export interface MergedStatus {
  status: FeedConstituencyStatus;
  /** Which results file holds the final state: R2 carries both rounds. */
  round: 1 | 2;
}

/**
 * One status per constituency. The round-1 index keeps `Pourvu = NON` for a constituency
 * decided at the second round (constaté sur les Ardennes le 27 septembre), so the round-2
 * index wins whenever it says `T2`.
 */
export function mergeIndexes(
  round1: FeedConstituencyStatus[],
  round2: FeedConstituencyStatus[]
): MergedStatus[] {
  const secondRound = new Map(round2.map((s) => [s.code, s]));
  return round1.map((status) => {
    const t2 = secondRound.get(status.code);
    return t2?.filled === "T2" ? { status: t2, round: 2 as const } : { status, round: 1 as const };
  });
}

/** Identifier given to the identity resolver for one elected person. */
export function resolverSourceId(e: FeedElected): string {
  return `SN2026-${e.constituencyCode}-${e.lastName}-${e.firstName}`;
}

/**
 * Outgoing seat first (closed set of 178), then a SAME decision of the resolver, else no
 * link. `resolverMatches` maps `resolverSourceId()` to a politician id and must only hold
 * SAME decisions.
 */
export function linkElected(
  elected: FeedElected[],
  outgoing: OutgoingSenateSeat[],
  resolverMatches: Map<string, string>
): PlannedElected[] {
  return elected.map((e) => {
    const seat = matchOutgoing(e, outgoing);
    if (seat) return { ...e, politicianId: seat.politicianId, link: "outgoing" as const };
    const resolved = resolverMatches.get(resolverSourceId(e));
    if (resolved) return { ...e, politicianId: resolved, link: "resolver" as const };
    return { ...e, politicianId: null, link: "none" as const };
  });
}
