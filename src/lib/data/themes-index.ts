import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { ThemeCategory } from "@/generated/prisma";
import { db } from "@/lib/db";
import { isSubjectPagePublishable } from "@/config/publication-gates";
import { THEME_CATEGORY_LABELS } from "@/config/labels";
import {
  selectFeaturedSubtopics,
  type FeaturedSubtopic,
} from "@/lib/presidentielle/featured-subtopics";
import { getPresidentialThemeIndexOrder, themeToSlug } from "@/lib/presidentielle/themes";
import { getPublicMeasuresByElection, type PublicMeasure } from "./measures";
import { getPublicPresidentialCandidates } from "./presidential-candidates-public";

export type { FeaturedSubtopic } from "@/lib/presidentielle/featured-subtopics";

/**
 * The read authority for the themes index / hub gate.
 *
 * `loadSubjectPageData` (in `./subject-page.ts`) counts `candidaciesWithVerifiedMeasure` by
 * iterating `getPublicPresidentialCandidates` — candidacies whose `CandidacyPresidential`
 * extension is PUBLISHED — and counting the ones with at least one currently-defended measure
 * on the theme. This authority MUST count on that same population, or it would advertise a
 * subject page as publishable while the page itself renders closed. A measure attached to a
 * DRAFT-extension candidacy therefore never counts here either, which is why every measure is
 * intersected against `publicIds` before being bucketed by theme.
 */

export type ThemeIndexEntry = {
  theme: ThemeCategory;
  label: string;
  slug: string;
  documentedMeasureCount: number;
  currentlyDefendedMeasureCount: number;
  /** Distinct public candidacies with at least one documented measure, withdrawals included. */
  documentedCandidacyCount: number;
  candidaciesWithVerifiedMeasure: number;
  lastReviewedAt: Date | null;
  publishable: boolean;
};

export type ThemesIndexData = {
  electionSlug: string;
  themes: ThemeIndexEntry[];
  featuredSubtopics: FeaturedSubtopic[];
  publishableSubjectPageCount: number;
};

/**
 * Plain async, integration-testable. Callers on a page use `getThemesIndex`, which caches this.
 */
export async function loadThemesIndex(
  electionId: string,
  electionSlug: string
): Promise<ThemesIndexData> {
  const [measures, publicCandidates] = await Promise.all([
    getPublicMeasuresByElection(electionId, { includeWithdrawn: true }),
    getPublicPresidentialCandidates(electionSlug), // the subject-page population
  ]);
  const publicIds = new Set(publicCandidates.map((c) => c.id));

  const byTheme = new Map<ThemeCategory, PublicMeasure[]>();
  for (const m of measures) {
    // The intersection with publicIds is the whole point: a measure on a DRAFT-extension
    // candidacy must not inflate the documented count or the gate.
    if (m.candidacyId === null || !publicIds.has(m.candidacyId)) continue;
    const list = byTheme.get(m.theme) ?? [];
    list.push(m);
    byTheme.set(m.theme, list);
  }

  const indexedThemes = getPresidentialThemeIndexOrder(new Set(byTheme.keys()));
  const themes: ThemeIndexEntry[] = indexedThemes.map((theme) => {
    const onTheme = byTheme.get(theme) ?? [];
    const defended = onTheme.filter((m) => m.withdrawal === null);
    const documentedCandidacies = new Set(onTheme.map((m) => m.candidacyId as string));
    const candidacies = new Set(defended.map((m) => m.candidacyId as string));
    const lastReviewedAt = onTheme.reduce<Date | null>(
      (latest, measure) =>
        latest === null || measure.reviewedAt > latest ? measure.reviewedAt : latest,
      null
    );
    return {
      theme,
      label: THEME_CATEGORY_LABELS[theme],
      slug: themeToSlug(theme),
      documentedMeasureCount: onTheme.length,
      currentlyDefendedMeasureCount: defended.length,
      documentedCandidacyCount: documentedCandidacies.size,
      candidaciesWithVerifiedMeasure: candidacies.size,
      lastReviewedAt,
      publishable: isSubjectPagePublishable(candidacies.size),
    };
  });

  return {
    electionSlug,
    themes,
    featuredSubtopics: selectFeaturedSubtopics(
      measures.filter(
        (measure) => measure.candidacyId !== null && publicIds.has(measure.candidacyId)
      )
    ),
    publishableSubjectPageCount: themes.filter((t) => t.publishable).length,
  };
}

export async function getThemesIndex(electionSlug: string): Promise<ThemesIndexData | null> {
  const election = await db.election.findUnique({
    where: { slug: electionSlug },
    select: { id: true },
  });
  if (election === null) return null;
  return getThemesIndexCached(election.id, electionSlug);
}

/**
 * Cached read for the hub page. Tagged the same as the measure authorities, so a measure
 * write busts it exactly when it busts the subject pages it summarizes.
 */
async function getThemesIndexCached(
  electionId: string,
  electionSlug: string
): Promise<ThemesIndexData> {
  "use cache";
  cacheTag(`election-measures:${electionId}`);
  // This read also filters on CandidacyPresidential.publicationStatus. Without this second tag,
  // publishing an extension busted nothing here and the surface stayed closed for 24h.
  cacheTag(`election-candidacies:${electionId}`);
  cacheLife("synced");
  return loadThemesIndex(electionId, electionSlug);
}
