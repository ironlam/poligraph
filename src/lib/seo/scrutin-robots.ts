import type { Metadata } from "next";
import type { ScrutinType } from "@/generated/prisma";

const NOINDEX_FOLLOW = { index: false, follow: true } as const;

/**
 * The indexability signals of a /parlement/votes/[slug] detail page. Deliberately
 * primitive (no Prisma row): the page passes the fields it already selected, the
 * sitemap mirrors the same predicate in SQL, and the rule stays testable without a DB.
 */
export interface ScrutinIndexSignals {
  /** `Scrutin.type`. Amendments face the stricter bar, see isIndexableScrutin. */
  type: ScrutinType | null;
  /** Sum of the three tallies. Zero means no ballot was recorded for this scrutin. */
  totalVotes: number;
  /** `Scrutin.citizenImpact`: what the vote changes for citizens. */
  citizenImpact: string | null;
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
 * way, filing a large share of them under "duplicate without user-selected canonical"
 * despite every one emitting a correct self-canonical. A canonical cannot fix
 * near-duplicate content; only withholding the page can. Volumes live in the dated note
 * under docs/search-console/ (gitignored), never in the repo.
 *
 * So an amendment has to earn its slot through a signal that took an editorial decision:
 * the key-vote flag, or a written citizen impact. Everything that is not an amendment
 * (vote solennel, motion, article) keeps its page: those decide a text or the fate of a
 * government, which is documentary value of its own even with no prose attached.
 *
 * Note on what is NOT a signal here, though it looks like one: `summary` and an APPROVED
 * policy title. Both are produced by generators that have since covered practically the
 * whole corpus, so requiring either of them excluded almost nothing. Measured against
 * production data before this predicate was written, an earlier version keyed on those
 * two withheld zero pages. A signal only discriminates while it stays scarce; if a
 * generator ever fills citizenImpact in bulk, this rule needs recalibrating the same way.
 *
 * Vote data is a precondition on top: a scrutin with no ballots recorded has nothing to
 * show whatever text hangs off it.
 *
 * An unknown `type` is fail-open (treated as not-an-amendment), consistent with the
 * commune-population and MAIRE-without-commune fallbacks elsewhere in the SEO rules:
 * a missing signal must never silently deindex a page.
 *
 * noindex,follow (not noindex,nofollow): the excluded pages still pass link equity to the
 * dossiers, politicians and themes they reference.
 */
export function isIndexableScrutin(signals: ScrutinIndexSignals): boolean {
  if (signals.totalVotes <= 0) return false;
  if (signals.type !== "AMENDEMENT") return true;

  return signals.isKeyVote || hasText(signals.citizenImpact);
}

/**
 * `robots` metadata fragment for a scrutin detail page. Returns {} for an indexable
 * scrutin so it inherits the site default (index:true). Spread into generateMetadata.
 */
export function scrutinRobotsMetadata(signals: ScrutinIndexSignals): Pick<Metadata, "robots"> {
  return isIndexableScrutin(signals) ? {} : { robots: NOINDEX_FOLLOW };
}
