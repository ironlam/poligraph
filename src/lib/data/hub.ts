import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { MeasureSourceKind, ThemeCategory } from "@/generated/prisma";
import { MEASURE_SOURCE_KIND_LABELS, THEME_CATEGORY_LABELS } from "@/config/labels";
import { db } from "@/lib/db";
import { keepOnePerCandidacy } from "@/lib/presidentielle/latest-measures";
import { PUBLIC_PRESIDENTIAL_MEASURE_WHERE } from "@/lib/presidentielle/publication";
import { themeToSlug } from "@/lib/theme-utils";
import { observeRead } from "@/lib/telemetry/read-operations";
import { isHubPublishable } from "@/config/publication-gates";
import {
  getPublicPresidentialCandidacyField,
  type PublicPresidentialCandidacyFieldEntry,
} from "./presidential-candidacy-field";
import { loadThemesIndex } from "./themes-index";
import type { FeaturedSubtopic } from "./themes-index";
import { loadPresidentialReaderGuideSummaries } from "./presidential-reader-guides";

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
  /** A bounded set of reviewed definitions with the broadest current corpus coverage. */
  featuredReaderGuides: Array<{
    slug: string;
    label: string;
    measureCount: number;
    candidateCount: number;
  }>;
};

/**
 * Not cached: ~11 rows today, and candidacy status/source edits have no invalidation path yet, so
 * caching this read would have nothing to bust it on a write. Real freshness still tops out at the
 * page's own `revalidate = 86400`: this function itself always reads live, but the rendered page
 * that calls it is only as fresh as its ISR backstop.
 */
export async function getHubCandidacyField(electionSlug: string): Promise<HubCandidacy[]> {
  return observeRead("presidential.field.load", async () => {
    const field = await getPublicPresidentialCandidacyField(electionSlug);
    return field?.candidacies ?? [];
  });
}

/**
 * Plain async, integration-testable. Callers on a page use `getHubMeasureContext`, which
 * caches this.
 */
export async function loadHubMeasureContext(...args: Parameters<typeof queryHubMeasureContext>) {
  return observeRead("presidential.hub.load", () => queryHubMeasureContext(...args));
}

async function queryHubMeasureContext(
  electionId: string,
  electionSlug: string
): Promise<HubMeasureContext> {
  const [election, themesIndex, readerGuides] = await Promise.all([
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
    loadPresidentialReaderGuideSummaries(electionId),
  ]);

  const lastReviewedAt = themesIndex.themes.reduce<Date | null>(
    (latest, theme) =>
      theme.lastReviewedAt !== null && (latest === null || theme.lastReviewedAt > latest)
        ? theme.lastReviewedAt
        : latest,
    null
  );

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
    featuredReaderGuides: readerGuides
      .filter((guide) => guide.indexable)
      .sort((a, b) => b.measureCount - a.measureCount || a.label.localeCompare(b.label, "fr"))
      .slice(0, 6)
      .map((guide) => ({
        slug: guide.slug,
        label: guide.label,
        measureCount: guide.measureCount,
        candidateCount: guide.candidateCount,
      })),
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

/** How many recent measures the hub shows. */
export const HUB_LATEST_MEASURES_LIMIT = 4;

/** Rows read before `keepOnePerCandidacy`. Bounded so the read stays one indexed `take`. */
const HUB_LATEST_MEASURES_SCAN = 24;

/**
 * One recently published measure, as the hub's "En ce moment" block names it.
 *
 * Same population as the measure detail page (`PUBLIC_PRESIDENTIAL_MEASURE_WHERE`), so every
 * row links to a page that exists. The source is reduced to its kind and host: the detail page
 * carries the full citation.
 */
export type HubLatestMeasure = {
  slug: string;
  text: string;
  publishedAt: Date;
  theme: ThemeCategory;
  themeLabel: string;
  themeSlug: string;
  candidateName: string;
  politicianSlug: string | null;
  photoUrl: string | null;
  blobPhotoUrl: string | null;
  source: { kindLabel: string; host: string | null } | null;
};

function sourceHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function toSource(source: { sourceKind: MeasureSourceKind; url: string } | undefined) {
  if (source === undefined) return null;
  return { kindLabel: MEASURE_SOURCE_KIND_LABELS[source.sourceKind], host: sourceHost(source.url) };
}

async function queryHubLatestMeasures(electionId: string): Promise<HubLatestMeasure[]> {
  const rows = await db.measure.findMany({
    where: { electionId, ...PUBLIC_PRESIDENTIAL_MEASURE_WHERE },
    // Publication order of the revision the public sees, not the measure's creation: a measure
    // created months ago and published today is news today.
    orderBy: [{ publishedRevision: { publishedAt: "desc" } }, { id: "asc" }],
    take: HUB_LATEST_MEASURES_SCAN,
    select: {
      slug: true,
      candidacyId: true,
      theme: true,
      publishedRevision: {
        select: {
          text: true,
          publishedAt: true,
          sources: {
            select: { sourceKind: true, url: true },
            // Enum declaration order: PRIMARY sorts before SECONDARY.
            orderBy: [{ tier: "asc" }, { publishedAt: "asc" }],
            take: 1,
          },
        },
      },
      candidacy: {
        select: {
          candidateName: true,
          politician: { select: { slug: true, photoUrl: true, blobPhotoUrl: true } },
        },
      },
    },
  });

  const candidates: Array<{ candidacyId: string | null; measure: HubLatestMeasure }> = [];
  for (const row of rows) {
    const revision = row.publishedRevision;
    if (revision === null || revision.publishedAt === null || row.candidacy === null) continue;
    const politician = row.candidacy.politician;
    candidates.push({
      candidacyId: row.candidacyId,
      measure: {
        slug: row.slug,
        text: revision.text,
        publishedAt: revision.publishedAt,
        theme: row.theme,
        themeLabel: THEME_CATEGORY_LABELS[row.theme],
        themeSlug: themeToSlug(row.theme),
        candidateName: row.candidacy.candidateName,
        politicianSlug: politician?.slug ?? null,
        photoUrl: politician?.photoUrl ?? null,
        blobPhotoUrl: politician?.blobPhotoUrl ?? null,
        source: toSource(revision.sources[0]),
      },
    });
  }
  return keepOnePerCandidacy(candidates, HUB_LATEST_MEASURES_LIMIT).map(({ measure }) => measure);
}

/** Plain async, integration-testable. Pages call `getHubLatestMeasures`, which caches this. */
export async function loadHubLatestMeasures(electionId: string) {
  return observeRead("presidential.hub.latest", () => queryHubLatestMeasures(electionId));
}

export async function getHubLatestMeasures(electionSlug: string): Promise<HubLatestMeasure[]> {
  const election = await db.election.findUnique({
    where: { slug: electionSlug },
    select: { id: true },
  });
  if (election === null) return [];
  return getHubLatestMeasuresCached(election.id);
}

/**
 * Same tags as the measure context: publishing a measure or a candidacy extension refreshes the
 * block on demand. No short profile, which would re-block the hub's 24 h ISR (AGENTS.md §5).
 */
async function getHubLatestMeasuresCached(electionId: string): Promise<HubLatestMeasure[]> {
  "use cache";
  cacheTag(`election-measures:${electionId}`);
  cacheTag(`election-candidacies:${electionId}`);
  cacheLife("synced");
  return loadHubLatestMeasures(electionId);
}
