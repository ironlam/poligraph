import type { Metadata } from "next";
import type { PolicyTitleStatus } from "@/generated/prisma";

const NOINDEX_FOLLOW = { index: false, follow: true } as const;

/**
 * The indexability signals of a /parlement/votes/[slug] detail page. Deliberately
 * primitive (no Prisma row): the page passes the fields it already selected, the
 * sitemap mirrors the same predicate in SQL, and the rule stays testable without a DB.
 */
export interface ScrutinIndexSignals {
  /** Sum of the three tallies. Zero means no ballot was recorded for this scrutin. */
  totalVotes: number;
  /** `Scrutin.summary`: AI-written recap of what was at stake. */
  summary: string | null;
  /** `Scrutin.citizenImpact`: what the vote changes for citizens. */
  citizenImpact: string | null;
  /** Status of the joined ScrutinPolicyTitle row, `null` when the scrutin has none. */
  policyTitleStatus: PolicyTitleStatus | null;
  /** `ScrutinImportance.isKeyVote`: editorially promoted on the parliament hub. */
  isKeyVote: boolean;
}

const hasText = (value: string | null): boolean => Boolean(value && value.trim().length > 0);

/**
 * True when a scrutin detail page carries enough of its own substance to deserve a slot
 * in the index.
 *
 * Amendment scrutins are the index-bloat engine of this site: they arrive by the
 * thousand, and a bare one renders the same layout around an official title that differs
 * from its neighbour's by an amendment number and a date. Google reads them exactly that
 * way: Search Console files a large share of these pages under "duplicate without
 * user-selected canonical", despite every one of them emitting a correct self-canonical.
 * A canonical cannot fix near-duplicate content; only withholding the page can. Volumes
 * live in the dated note under docs/search-console/ (gitignored), never in the repo.
 *
 * So a scrutin earns indexation through one of four signals, each meaning a human or a
 * generator produced something specific about *this* vote:
 *   - an APPROVED policy title (a plain-language heading, unique per scrutin),
 *   - a summary,
 *   - a citizen impact,
 *   - an editorial key-vote flag.
 *
 * Vote data is a precondition on top: a scrutin with no ballots recorded has nothing to
 * show whatever text hangs off it. This subsumes the previous `!summary && total === 0`
 * thin-content guard, which was narrow enough to catch almost nothing.
 *
 * noindex,follow (not noindex,nofollow): the excluded pages still pass link equity to the
 * dossiers, politicians and themes they reference.
 */
export function isIndexableScrutin(signals: ScrutinIndexSignals): boolean {
  if (signals.totalVotes <= 0) return false;

  return (
    signals.isKeyVote ||
    signals.policyTitleStatus === "APPROVED" ||
    hasText(signals.summary) ||
    hasText(signals.citizenImpact)
  );
}

/**
 * `robots` metadata fragment for a scrutin detail page. Returns {} for an indexable
 * scrutin so it inherits the site default (index:true). Spread into generateMetadata.
 */
export function scrutinRobotsMetadata(signals: ScrutinIndexSignals): Pick<Metadata, "robots"> {
  return isIndexableScrutin(signals) ? {} : { robots: NOINDEX_FOLLOW };
}
