import type { ThemeCategory } from "@/generated/prisma";
import type { PresidentialReaderGuideIndexItem } from "@/lib/data/presidential-reader-guides";
import type { ThemesIndexData } from "@/lib/data/themes-index";
import type {
  PoliticianFactCheckItem,
  PoliticianFactCheckLanding,
} from "@/lib/data/factcheck-politician";

export type CandidateReaderGuideLink = { slug: string; label: string };

/**
 * Subject pages a candidate fiche may link to. Reads the same `publishable` flag as the subject page
 * metadata and the sitemap, so the fiche never links to a page held out of the index.
 */
export function selectComparableThemes(index: ThemesIndexData | null): ReadonlySet<ThemeCategory> {
  return new Set(index?.themes.filter((theme) => theme.publishable).map((theme) => theme.theme));
}

/**
 * Reader guides mentioned by this candidate's public measures, restricted to the indexable ones for
 * the same reason. The index is already sorted by label.
 */
export function selectCandidateReaderGuides(
  guides: readonly PresidentialReaderGuideIndexItem[],
  candidateSlug: string
): CandidateReaderGuideLink[] {
  return guides
    .filter(
      (guide) =>
        guide.indexable && guide.measures.some((measure) => measure.candidateSlug === candidateSlug)
    )
    .map(({ slug, label }) => ({ slug, label }));
}

/** Most recent verified claims shown on the fiche. The full list lives on the fact-check landing. */
export const CANDIDATE_FACTCHECKS_RECENT = 3;

export interface CandidateFactCheckSummary {
  total: number;
  sourceCount: number;
  breakdown: PoliticianFactCheckLanding["breakdown"];
  recent: PoliticianFactCheckItem[];
  /** Where "see all" goes: the landing when it is indexable, the filtered list otherwise. */
  href: string;
}

/**
 * What the fiche shows of a candidate's fact-checks, or null to render nothing.
 *
 * Claims the candidate MADE only. The fact-checks that merely cite them stay off the fiche until
 * single-word mentions are validated by a human: today a first name alone can attach a rumour to
 * the wrong person, and a candidate fiche is the last place to show that.
 *
 * The link follows the landing's own robots rule (`landing.indexable`), so the fiche only passes
 * weight to a page that is in the index, the same contract as the theme and reader-guide links.
 * Same threshold and same shape for every candidate: no ordering, no ratio, no adjective.
 */
export function selectCandidateFactChecks(
  landing: PoliticianFactCheckLanding | null,
  paths: { landing: string; filtered: string }
): CandidateFactCheckSummary | null {
  if (!landing || landing.claimed.length === 0) return null;
  return {
    total: landing.claimed.length,
    sourceCount: landing.bySource.length,
    breakdown: landing.breakdown,
    recent: landing.claimed.slice(0, CANDIDATE_FACTCHECKS_RECENT),
    href: landing.indexable ? paths.landing : paths.filtered,
  };
}
