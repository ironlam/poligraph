import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { ThemeCategory } from "@/generated/prisma";
import { db } from "@/lib/db";
import { isSubjectPagePublishable } from "@/config/publication-gates";
import { THEME_CATEGORY_LABELS } from "@/config/labels";
import { THEMES_IN_ORDER, themeToSlug } from "@/lib/presidentielle/themes";
import { getPublicMeasuresByElection, type PublicMeasure } from "./measures";
import { getPublicPresidentialCandidates } from "./presidential-candidates-public";

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
  candidaciesWithVerifiedMeasure: number;
  publishable: boolean;
};

export type ThemesIndexData = {
  electionSlug: string;
  themes: ThemeIndexEntry[];
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

  const themes: ThemeIndexEntry[] = THEMES_IN_ORDER.map((theme) => {
    const onTheme = byTheme.get(theme) ?? [];
    const defended = onTheme.filter((m) => m.withdrawal === null);
    const candidacies = new Set(defended.map((m) => m.candidacyId as string));
    return {
      theme,
      label: THEME_CATEGORY_LABELS[theme],
      slug: themeToSlug(theme),
      documentedMeasureCount: onTheme.length,
      currentlyDefendedMeasureCount: defended.length,
      candidaciesWithVerifiedMeasure: candidacies.size,
      publishable: isSubjectPagePublishable(candidacies.size),
    };
  });

  return {
    electionSlug,
    themes,
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
  cacheLife("synced");
  return loadThemesIndex(electionId, electionSlug);
}
