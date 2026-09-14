import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { ThemeCategory } from "@/generated/prisma";
import { db } from "@/lib/db";
import { observeRead } from "@/lib/telemetry/read-operations";
import { isSubjectPagePublishable } from "@/config/publication-gates";
import { THEME_CATEGORY_LABELS } from "@/config/labels";
import {
  selectFeaturedSubtopicsFromAggregates,
  type FeaturedSubtopic,
} from "@/lib/presidentielle/featured-subtopics";
import { getPresidentialThemeIndexOrder, themeToSlug } from "@/lib/presidentielle/themes";
import {
  getPublicMeasureSubtopicRollupsByElection,
  getPublicMeasureThemeRollupsByElection,
} from "./measures";

export type { FeaturedSubtopic } from "@/lib/presidentielle/featured-subtopics";

/**
 * The read authority for the themes index / hub gate.
 *
 * `loadSubjectPageData` (in `./subject-page.ts`) counts `candidaciesWithVerifiedMeasure` on
 * candidacies whose `CandidacyPresidential` extension is PUBLISHED. This authority MUST count on
 * that same population, or it would advertise a subject page as publishable while the page itself
 * renders closed. The PostgreSQL aggregate applies that intersection before grouping, so a measure
 * attached to a DRAFT-extension candidacy never counts here either.
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
export async function loadThemesIndex(...args: Parameters<typeof queryThemesIndex>) {
  return observeRead("presidential.themes.load", () => queryThemesIndex(...args));
}

async function queryThemesIndex(
  electionId: string,
  electionSlug: string
): Promise<ThemesIndexData> {
  const [byTheme, subtopics] = await Promise.all([
    getPublicMeasureThemeRollupsByElection(electionId),
    getPublicMeasureSubtopicRollupsByElection(electionId),
  ]);

  const indexedThemes = getPresidentialThemeIndexOrder(new Set(byTheme.keys()));
  const themes: ThemeIndexEntry[] = indexedThemes.map((theme) => {
    const rollup = byTheme.get(theme);
    return {
      theme,
      label: THEME_CATEGORY_LABELS[theme],
      slug: themeToSlug(theme),
      documentedMeasureCount: rollup?.documentedMeasureCount ?? 0,
      currentlyDefendedMeasureCount: rollup?.currentlyDefendedMeasureCount ?? 0,
      documentedCandidacyCount: rollup?.documentedCandidacyCount ?? 0,
      candidaciesWithVerifiedMeasure: rollup?.candidaciesWithVerifiedMeasure ?? 0,
      lastReviewedAt: rollup?.lastReviewedAt ?? null,
      publishable: isSubjectPagePublishable(rollup?.candidaciesWithVerifiedMeasure ?? 0),
    };
  });

  return {
    electionSlug,
    themes,
    featuredSubtopics: selectFeaturedSubtopicsFromAggregates(subtopics),
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
