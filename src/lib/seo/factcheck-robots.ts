import type { Metadata } from "next";

const NOINDEX_FOLLOW = { index: false, follow: true } as const;

/**
 * A fact-check page repeats the outlet's title and claim: on its own it is a short duplicate of
 * the source. It earns a place in the index through what Poligraph adds around a single identified
 * author, and that addition has to be specific to this claim: the author's record, party or
 * candidacy is the same on every page of theirs, so it cannot tell two of those pages apart.
 *
 * Measured on 2026-11-22: the party block counted for 562 of the 591 fact-checks with a single
 * author, and let 283 pages into the index on its own. A signal present nearly everywhere
 * discriminates nothing (AGENTS.md §5), so it no longer counts.
 *
 * Published programme measures on the validated theme are specific to the claim: same author,
 * same theme. Measured on 2026-11-25: 50 pages with author context but no claim-specific block
 * have such measures. The same rule applies to every person and every party.
 */

/**
 * The record counts as author context only when the author has another public fact-check: a
 * record made of the page's own fact-check tells the reader nothing new.
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
  /** The claim's theme is validated in the admin and the author voted on scrutins of that theme. */
  hasThemeVotes: boolean;
  /** Published presidential 2027 measures of the same author on the validated claim theme. */
  hasThemeProgramme: boolean;
}

/** A block tied to the claim day or to the same author's activity on its validated theme. */
export function hasClaimSpecificBlock(signals: FactCheckIndexSignals): boolean {
  return signals.hasClaimDayVotes || signals.hasThemeVotes || signals.hasThemeProgramme;
}

/** A block that situates the author: their record with the fact-checkers, or their candidacy. */
export function hasAuthorContextBlock(signals: FactCheckIndexSignals): boolean {
  return signals.authorFactCheckCount >= FACTCHECK_RECORD_MIN_TOTAL || signals.hasCandidacy;
}

/**
 * Same rule for every person and every party. Mirrored in SQL by the fact-check sitemap shard
 * (src/app/sitemap.ts, buildFactChecksSitemap): keep both in sync.
 */
export function isIndexableFactCheck(signals: FactCheckIndexSignals): boolean {
  return (
    signals.hasPublishedAuthor && hasClaimSpecificBlock(signals) && hasAuthorContextBlock(signals)
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
