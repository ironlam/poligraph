import type { ThemeCategory } from "@/generated/prisma";
import type { PresidentialReaderGuideIndexItem } from "@/lib/data/presidential-reader-guides";
import type { ThemesIndexData } from "@/lib/data/themes-index";

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
