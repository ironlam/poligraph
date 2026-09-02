import "server-only";
import type { ThemeCategory } from "@/generated/prisma";
import { THEME_CATEGORY_LABELS } from "@/config/labels";
import { pickMeasureSourceUrl } from "@/lib/presidentielle/measure-source";
import { parseThemeSlug } from "@/lib/presidentielle/themes";
import { getPublicPresidentialCandidates } from "./presidential-candidates-public";
import { getSubjectPageData } from "./subject-page";
import type { PublicMeasure } from "./measures";
import { getThemesIndex } from "./themes-index";

const MAX_CANDIDATES = 3;
const MEASURES_PER_CANDIDATE = 6;

export type PresidentialComparisonOption = {
  candidacyId: string;
  name: string;
  slug: string;
  partyLabel: string | null;
  accentColor: string | null;
};

export type PresidentialComparisonMeasure = {
  id: string;
  slug: string;
  text: string;
  sourceUrl: string | null;
  subtopics: Array<{ slug: string; label: string }>;
  precision: PublicMeasure["precision"];
  qualifications: PublicMeasure["qualifications"];
  withdrawal: PublicMeasure["withdrawal"];
};

export type PresidentialComparisonCandidate = PresidentialComparisonOption & {
  measures: PresidentialComparisonMeasure[];
  totalMeasures: number;
  page: number;
  totalPages: number;
};

export type PresidentialComparison = {
  candidateOptions: PresidentialComparisonOption[];
  themes: Array<{ code: ThemeCategory; slug: string; label: string }>;
  selectedTheme: { code: ThemeCategory; slug: string; label: string } | null;
  selectedCandidates: PresidentialComparisonCandidate[];
  lastReviewedAt: Date | null;
};

function toOption(candidate: {
  id: string;
  candidateName: string;
  politicianSlug: string | null;
  partyLabel: string | null;
  accentColor: string | null;
}): PresidentialComparisonOption | null {
  if (candidate.politicianSlug === null) return null;
  return {
    candidacyId: candidate.id,
    name: candidate.candidateName,
    slug: candidate.politicianSlug,
    partyLabel: candidate.partyLabel,
    accentColor: candidate.accentColor,
  };
}

function normalizeCandidateSlugs(slugs: string[]): string[] {
  return [...new Set(slugs.map((slug) => slug.trim()).filter(Boolean))].slice(0, MAX_CANDIDATES);
}

function normalizePage(value: number | undefined, totalPages: number): number {
  if (!Number.isSafeInteger(value) || !value || value < 1) return 1;
  return Math.min(value, totalPages);
}

/**
 * One public comparison read. Callers provide URL-shaped values and receive only validated,
 * published content in the repository's alphabetical candidacy order.
 */
export async function getPresidentialComparison({
  electionSlug,
  candidateSlugs,
  themeSlug,
  candidatePages = {},
}: {
  electionSlug: string;
  candidateSlugs: string[];
  themeSlug?: string;
  candidatePages?: Record<string, number>;
}): Promise<PresidentialComparison | null> {
  const theme = themeSlug ? parseThemeSlug(themeSlug) : null;
  const normalizedSlugs = normalizeCandidateSlugs(candidateSlugs);

  if (theme !== null) {
    const subject = await getSubjectPageData(electionSlug, theme);
    if (subject === null || !subject.publishable) return null;

    const candidateOptions = subject.candidates
      .map(({ candidate }) => toOption(candidate))
      .filter((candidate): candidate is PresidentialComparisonOption => candidate !== null);
    const selected = new Set(normalizedSlugs);
    const selectedCandidates = subject.candidates.flatMap(({ candidate, measures }) => {
      const option = toOption(candidate);
      if (option === null || !selected.has(option.slug)) return [];
      const currentMeasures = measures.map(({ measure }) => ({
        id: measure.id,
        slug: measure.slug,
        text: measure.text,
        sourceUrl: pickMeasureSourceUrl(measure.sources),
        subtopics: measure.subtopics,
        precision: measure.precision,
        qualifications: measure.qualifications,
        withdrawal: measure.withdrawal,
      }));
      const totalPages = Math.max(1, Math.ceil(currentMeasures.length / MEASURES_PER_CANDIDATE));
      const page = normalizePage(candidatePages[option.slug], totalPages);
      const offset = (page - 1) * MEASURES_PER_CANDIDATE;
      return [
        {
          ...option,
          measures: currentMeasures.slice(offset, offset + MEASURES_PER_CANDIDATE),
          totalMeasures: currentMeasures.length,
          page,
          totalPages,
        },
      ];
    });

    return {
      candidateOptions,
      themes: subject.siblingThemes
        .filter((item) => item.publishable)
        .map((item) => ({ code: item.theme, slug: item.slug, label: item.label })),
      selectedTheme: {
        code: theme,
        slug: themeSlug!,
        label: THEME_CATEGORY_LABELS[theme],
      },
      selectedCandidates,
      lastReviewedAt: subject.lastReviewedAt,
    };
  }

  const [candidates, themesIndex] = await Promise.all([
    getPublicPresidentialCandidates(electionSlug),
    getThemesIndex(electionSlug),
  ]);
  if (themesIndex === null) return null;
  const candidateOptions = candidates
    .map(toOption)
    .filter((candidate): candidate is PresidentialComparisonOption => candidate !== null);
  const selected = new Set(normalizedSlugs);

  return {
    candidateOptions,
    themes: themesIndex.themes
      .filter((item) => item.publishable)
      .map((item) => ({ code: item.theme, slug: item.slug, label: item.label })),
    selectedTheme: null,
    selectedCandidates: candidateOptions
      .filter((candidate) => selected.has(candidate.slug))
      .map((candidate) => ({
        ...candidate,
        measures: [],
        totalMeasures: 0,
        page: 1,
        totalPages: 1,
      })),
    lastReviewedAt: null,
  };
}
