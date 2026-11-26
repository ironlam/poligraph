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
 * this many fact-checks gathered on it: the claims they made, plus the fact-checks about them on a
 * confirmed mention (full name, or last name validated in the admin, see
 * src/lib/factchecks/mention-review.ts). A mention still waiting for review counts for nothing, so
 * a homonym can never bring a page into the index.
 *
 * Why both count: the fact-check of a rumour is a short copy of its source and stays noindex, but
 * readers look for the person, not for one rumour. Gathered on the person's page, next to
 * their own record, those checks are context only Poligraph puts together. Measured on 2026-11-26:
 * 61 indexable landings on claims alone, 79 with both.
 *
 * Same threshold for every person and every party. Mirrored in SQL by the fact-check sitemap shard
 * (src/app/sitemap.ts, buildFactChecksSitemap): keep both in sync.
 */
export const FACTCHECK_POLITICIAN_MIN_CLAIMS = 3;

export interface FactCheckPoliticianCounts {
  /** Public fact-checks where the politician is the claimant. */
  claimed: number;
  /** Public fact-checks about the politician, not as claimant, on a confirmed mention. */
  aboutConfirmed: number;
}

export function isIndexableFactCheckPolitician({
  claimed,
  aboutConfirmed,
}: FactCheckPoliticianCounts): boolean {
  return claimed + aboutConfirmed >= FACTCHECK_POLITICIAN_MIN_CLAIMS;
}

/**
 * Metadata of the filtered listing /factchecks?politician=X. It lists the same fact-checks as the
 * person's landing, without its counts or its threshold: indexed, it competed with the landing, one
 * view per person with a public fact-check, most of them with a single one. Always noindex,follow, canonical on
 * the landing, or on the bare listing when the person has no landing (no public fact-check).
 *
 * The description says "qui citent": the view lists rumours about the person as well as their own
 * claims.
 */
export function filteredPoliticianViewMetadata(
  fullName: string,
  landingPath: string | null
): Pick<Metadata, "title" | "description" | "robots" | "alternates"> {
  return {
    title: `Fact-checks de ${fullName}`,
    description: `Les fact-checks qui citent ${fullName} : ses déclarations vérifiées et les vérifications à son sujet, par AFP Factuel, Les Décodeurs et d'autres rédactions reconnues.`,
    robots: NOINDEX_FOLLOW,
    alternates: { canonical: landingPath ?? "/factchecks" },
  };
}
