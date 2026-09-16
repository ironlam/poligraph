import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/db";
import { observeRead } from "@/lib/telemetry/read-operations";
import type { ThemeCategory } from "@/generated/prisma";
import { THEME_CATEGORY_LABELS } from "@/config/labels";
import { pickMeasureSourceUrl } from "@/lib/presidentielle/measure-source";
import { parseThemeSlug } from "@/lib/presidentielle/themes";
import { getPublicPresidentialCandidates } from "./presidential-candidates-public";
import {
  getPublicComparisonMeasureCounts,
  getPublicComparisonMeasurePage,
  type PublicMeasure,
} from "./measures";
import { getThemesIndex, loadThemesIndex } from "./themes-index";

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

async function getComparisonContext(
  electionId: string,
  electionSlug: string,
  theme: ThemeCategory
) {
  "use cache";
  cacheLife("synced");
  cacheTag(`election-measures:${electionId}`, `election-candidacies:${electionId}`);
  return observeRead("presidential.comparison.context.load", async () => {
    const [candidates, themesIndex, counts] = await Promise.all([
      getPublicPresidentialCandidates(electionSlug),
      loadThemesIndex(electionId, electionSlug),
      getPublicComparisonMeasureCounts(electionId, theme),
    ]);
    return { candidates, themesIndex, counts };
  });
}

async function getComparisonPage(
  electionId: string,
  candidacyId: string,
  theme: ThemeCategory,
  page: number
): Promise<PresidentialComparisonMeasure[]> {
  "use cache";
  cacheLife("synced");
  cacheTag(`election-measures:${electionId}`, `election-candidacies:${electionId}`);
  return observeRead("presidential.comparison.page.load", async () => {
    const measures = await getPublicComparisonMeasurePage({
      electionId,
      candidacyId,
      theme,
      skip: (page - 1) * MEASURES_PER_CANDIDATE,
      take: MEASURES_PER_CANDIDATE,
    });
    return measures.map(({ sources, ...measure }) => ({
      ...measure,
      sourceUrl: pickMeasureSourceUrl(sources),
    }));
  });
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
    const election = await db.election.findUnique({
      where: { slug: electionSlug },
      select: { id: true },
    });
    if (election === null) return null;
    const { candidates, themesIndex, counts } = await getComparisonContext(
      election.id,
      electionSlug,
      theme
    );
    const subject = themesIndex.themes.find((item) => item.theme === theme);
    if (!subject?.publishable) return null;

    const candidateOptions = candidates
      .map(toOption)
      .filter((candidate): candidate is PresidentialComparisonOption => candidate !== null);
    const selected = new Set(normalizedSlugs);
    const selectedCandidates = await Promise.all(
      candidateOptions
        .filter((option) => selected.has(option.slug))
        .map(async (option) => {
          const totalMeasures = counts.get(option.candidacyId) ?? 0;
          const totalPages = Math.max(1, Math.ceil(totalMeasures / MEASURES_PER_CANDIDATE));
          const page = normalizePage(candidatePages[option.slug], totalPages);
          // Only known public candidacy IDs and clamped pages enter the cache key.
          const measures =
            totalMeasures === 0
              ? []
              : await getComparisonPage(election.id, option.candidacyId, theme, page);
          return {
            ...option,
            measures,
            totalMeasures,
            page,
            totalPages,
          };
        })
    );

    return {
      candidateOptions,
      themes: themesIndex.themes
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
