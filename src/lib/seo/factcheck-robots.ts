import type { Metadata } from "next";

const NOINDEX_FOLLOW = { index: false, follow: true } as const;

/**
 * A fact-check page repeats the outlet's title and claim: on its own it is a short duplicate of
 * the source. It earns a place in the index only through the context Poligraph adds around a
 * single identified author, and only when at least this many context blocks carry something.
 */
export const FACTCHECK_MIN_CONTEXT_BLOCKS = 2;

/**
 * The record block counts only when the author has another public fact-check: a record made of
 * the page's own fact-check tells the reader nothing new.
 */
export const FACTCHECK_RECORD_MIN_TOTAL = 2;

export interface FactCheckIndexSignals {
  /** Exactly one claimant, linked to a published profile. */
  hasPublishedAuthor: boolean;
  /** Public fact-checks where that author is the claimant, this one included. */
  authorFactCheckCount: number;
  /** Sourced presidential 2027 candidacy (the candidacy block). */
  hasCandidacy: boolean;
  /** The author voted (for, against, abstention) on the day of the claim. */
  hasClaimDayVotes: boolean;
  /** The author has a current party (the party block). */
  hasParty: boolean;
}

/** Context blocks with content, the author's identity aside. */
export function countFactCheckContextBlocks(signals: FactCheckIndexSignals): number {
  if (!signals.hasPublishedAuthor) return 0;
  return [
    signals.authorFactCheckCount >= FACTCHECK_RECORD_MIN_TOTAL,
    signals.hasCandidacy,
    signals.hasClaimDayVotes,
    signals.hasParty,
  ].filter(Boolean).length;
}

/**
 * Same rule for every person and every party. Mirrored in SQL by the fact-check sitemap shard
 * (src/app/sitemap.ts, buildFactChecksSitemap): keep both in sync.
 */
export function isIndexableFactCheck(signals: FactCheckIndexSignals): boolean {
  return (
    signals.hasPublishedAuthor &&
    countFactCheckContextBlocks(signals) >= FACTCHECK_MIN_CONTEXT_BLOCKS
  );
}

/** `robots` fragment from a verdict computed once by the data layer. */
export function factCheckRobotsMetadata(indexable: boolean): Pick<Metadata, "robots"> {
  return indexable ? {} : { robots: NOINDEX_FOLLOW };
}

/**
 * The landing page of a politician's fact-checks, /factchecks/politique/[slug], is indexable from
 * this many claims attributed to them. Same threshold for every person and every party. Mirrored
 * in SQL by the fact-check sitemap shard.
 */
export const FACTCHECK_POLITICIAN_MIN_CLAIMS = 3;

export function isIndexableFactCheckPolitician(claimedCount: number): boolean {
  return claimedCount >= FACTCHECK_POLITICIAN_MIN_CLAIMS;
}
