import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { ThemeCategory } from "@/generated/prisma";
import { db } from "@/lib/db";
import { isHubPublishable } from "@/config/publication-gates";
import {
  getPublicPresidentialCandidacyField,
  type PublicPresidentialCandidacyFieldEntry,
} from "./presidential-candidacy-field";
import { loadThemesIndex } from "./themes-index";
import type { FeaturedSubtopic } from "./themes-index";
import { getLatestPresidentialReviewDate } from "./measures";

/**
 * The two read authorities for the presidential hub page.
 *
 * The candidacy field and the published fiches are two different populations, and this file
 * exists to keep them that way. `getHubCandidacyField` shows every sourced candidacy attached to
 * a public politician (status + `sourceUrl` + `sourceLabel` non-null), pressenti/envisagé included,
 * extension NOT required, because the hub has to show the field before anyone has a published
 * presidential extension. Routing it through `getPublicPresidentialCandidates` (the
 * PUBLISHED-extension population used by the subject pages) would empty the hub at launch.
 *
 * `getHubMeasureContext`, by contrast, summarizes the same subject pages the themes index
 * gates: it is cached under the same `election-measures:${electionId}` tag as the measure
 * authorities, so a measure write busts it exactly when it busts the pages it summarizes.
 *
 * `loadHubMeasureContext` is the plain async body, integration-testable the same way
 * `loadThemesIndex`/`loadSubjectPageData` are: a `"use cache"` boundary throws outside a Next
 * request/build context, so tests exercise the uncached loader and pages call the cached
 * wrapper.
 */

export type HubCandidacy = PublicPresidentialCandidacyFieldEntry;

/**
 * One subject, as the hub home names it: enough to link to its page and to say whether it is open
 * to comparison, and nothing else.
 *
 * Deliberately NOT the full `ThemeIndexEntry`. The index page speaks in "mesures documentées"
 * (withdrawals included) while the hub header counts currently defended ones, so shipping the
 * index's counters here would put two different numbers for the same subject on two pages, with
 * nothing on screen explaining the gap. The hub links to the index for the detail instead.
 */
export type HubTheme = {
  theme: ThemeCategory;
  label: string;
  slug: string;
  publishable: boolean;
};

export type HubMeasureContext = {
  electionTitle: string;
  round1Date: Date | null;
  round2Date: Date | null;
  dateConfirmed: boolean;
  electionDescription: string | null;
  publishableSubjectPageCount: number;
  hubPublishable: boolean;
  verifiedMeasureCount: number;
  lastReviewedAt: Date | null;
  /** The thirteen subjects in reading order, so the hub can name them without a second read. */
  themes: HubTheme[];
  /** A bounded, diversified set of human-approved subtopics for direct corpus exploration. */
  featuredSubtopics: FeaturedSubtopic[];
};

/**
 * Not cached: ~11 rows today, and candidacy status/source edits have no invalidation path yet, so
 * caching this read would have nothing to bust it on a write. Real freshness still tops out at the
 * page's own `revalidate = 86400`: this function itself always reads live, but the rendered page
 * that calls it is only as fresh as its ISR backstop.
 */
export async function getHubCandidacyField(electionSlug: string): Promise<HubCandidacy[]> {
  const field = await getPublicPresidentialCandidacyField(electionSlug);
  return field?.candidacies ?? [];
}

/**
 * Plain async, integration-testable. Callers on a page use `getHubMeasureContext`, which
 * caches this.
 */
export async function loadHubMeasureContext(
  electionId: string,
  electionSlug: string
): Promise<HubMeasureContext> {
  const [election, themesIndex, lastReviewedAt] = await Promise.all([
    db.election.findUniqueOrThrow({
      where: { id: electionId },
      select: {
        title: true,
        round1Date: true,
        round2Date: true,
        dateConfirmed: true,
        description: true,
      },
    }),
    loadThemesIndex(electionId, electionSlug),
    getLatestPresidentialReviewDate(electionId),
  ]);

  // Derived from the themes index rather than a fresh getPublicMeasuresByElection() read: the
  // subject pages are the only surface that renders a measure, and only for candidacies with a
  // PUBLISHED extension. A measure on a DRAFT-extension candidacy is unreachable there, so
  // counting it here would announce more measures than the hub can actually lead a reader to.
  const verifiedMeasureCount = themesIndex.themes.reduce(
    (n, t) => n + t.currentlyDefendedMeasureCount,
    0
  );

  return {
    electionTitle: election.title,
    round1Date: election.round1Date,
    round2Date: election.round2Date,
    dateConfirmed: election.dateConfirmed,
    electionDescription: election.description,
    publishableSubjectPageCount: themesIndex.publishableSubjectPageCount,
    hubPublishable: isHubPublishable(themesIndex.publishableSubjectPageCount),
    verifiedMeasureCount,
    lastReviewedAt,
    themes: themesIndex.themes.map(({ theme, label, slug, publishable }) => ({
      theme,
      label,
      slug,
      publishable,
    })),
    featuredSubtopics: themesIndex.featuredSubtopics,
  };
}

export async function getHubMeasureContext(
  electionSlug: string
): Promise<HubMeasureContext | null> {
  const election = await db.election.findUnique({
    where: { slug: electionSlug },
    select: { id: true },
  });
  if (election === null) return null;
  return getHubMeasureContextCached(election.id, electionSlug);
}

/**
 * Cached read for the hub page. Tagged the same as the measure authorities, so a measure write
 * busts it exactly when it busts the subject pages it summarizes.
 */
async function getHubMeasureContextCached(
  electionId: string,
  electionSlug: string
): Promise<HubMeasureContext> {
  "use cache";
  cacheTag(`election-measures:${electionId}`);
  // This read also filters on CandidacyPresidential.publicationStatus. Without this second tag,
  // publishing an extension busted nothing here and the surface stayed closed for 24h.
  cacheTag(`election-candidacies:${electionId}`);
  cacheLife("synced");
  return loadHubMeasureContext(electionId, electionSlug);
}
