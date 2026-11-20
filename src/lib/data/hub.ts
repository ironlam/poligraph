import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { MeasureSourceKind, ThemeCategory } from "@/generated/prisma";
import {
  CANDIDACY_STATUS_LABELS,
  MEASURE_SOURCE_KIND_LABELS,
  THEME_CATEGORY_LABELS,
} from "@/config/labels";
import { db } from "@/lib/db";
import { isPrimaryDefeat } from "@/lib/presidentielle/candidacy-outcome";
import { PUBLIC_PRESIDENTIAL_MEASURE_WHERE } from "@/lib/presidentielle/publication";
import { themeToSlug } from "@/lib/theme-utils";
import { observeRead } from "@/lib/telemetry/read-operations";
import { isHubPublishable } from "@/config/publication-gates";
import {
  getPublicPresidentialCandidacyField,
  type PublicPresidentialCandidacyFieldEntry,
} from "./presidential-candidacy-field";
import { PUBLIC_TRACKED_PRESIDENTIAL_CANDIDACY_WHERE } from "./presidential-candidacy-policy";
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

/** How many recent updates the hub shows. */
export const HUB_LATEST_MEASURES_LIMIT = 4;

/**
 * One recently published measure, as the hub's "En ce moment" block names it.
 *
 * Same population as the measure detail page (`PUBLIC_PRESIDENTIAL_MEASURE_WHERE`), so every
 * row links to a page that exists. The source is reduced to its kind and host: the detail page
 * carries the full citation.
 */
export type HubLatestMeasure = {
  candidacyId: string;
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
  // One query per candidacy shown, each excluding the candidacies already taken. A fixed scan
  // of the newest rows fails the day a batch is published for one candidate: they would all be
  // his, and the block would collapse to a single card.
  const latest: HubLatestMeasure[] = [];
  const taken: string[] = [];
  while (latest.length < HUB_LATEST_MEASURES_LIMIT) {
    const row = await db.measure.findFirst({
      where: {
        electionId,
        ...PUBLIC_PRESIDENTIAL_MEASURE_WHERE,
        candidacyId: { not: null, notIn: taken },
      },
      // Publication order of the revision the public sees, not the measure's creation: a
      // measure created months ago and published today is news today.
      orderBy: [{ publishedRevision: { publishedAt: "desc" } }, { id: "asc" }],
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
    if (row === null) break;
    // Taken before the checks below: a row we cannot show must not be read again.
    if (row.candidacyId !== null) taken.push(row.candidacyId);
    const revision = row.publishedRevision;
    if (revision === null || revision.publishedAt === null || row.candidacy === null) continue;
    const politician = row.candidacy.politician;
    if (row.candidacyId === null) continue;
    latest.push({
      candidacyId: row.candidacyId,
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
    });
  }
  return latest;
}

/**
 * A change of status the hub reports: a candidacy announced, made official, or ended. A move
 * between "pressentie" and "évoquée" is a degree of sourcing, not news, and stays out.
 */
export type HubStatusChange = {
  candidacyId: string;
  candidateName: string;
  politicianSlug: string;
  photoUrl: string | null;
  blobPhotoUrl: string | null;
  /** The site's own wording, primary defeat included: never "retirée" for a lost primary. */
  statusLabel: string;
  changedAt: Date;
  sourceLabel: string;
  sourceHost: string | null;
};

export type HubLatestUpdate =
  | ({ kind: "measure" } & HubLatestMeasure)
  | ({ kind: "status" } & HubStatusChange);

async function queryHubStatusChanges(electionId: string): Promise<HubStatusChange[]> {
  const rows = await db.candidacy.findMany({
    where: {
      electionId,
      ...PUBLIC_TRACKED_PRESIDENTIAL_CANDIDACY_WHERE,
      status: { in: ["DECLARE", "OFFICIAL", "RETIRE"] },
      statusChangedAt: { not: null },
    },
    orderBy: [{ statusChangedAt: "desc" }, { id: "asc" }],
    // A literal, which is all the read-bounds guard can prove. Above the block's limit on
    // purpose: the merge below slices to it.
    take: 10,
    select: {
      id: true,
      candidateName: true,
      status: true,
      statusChangedAt: true,
      sourceUrl: true,
      sourceLabel: true,
      presidentialData: { select: { withdrewReason: true } },
      politician: { select: { slug: true, photoUrl: true, blobPhotoUrl: true } },
    },
  });
  return rows.flatMap((row) => {
    if (
      row.politician === null ||
      row.status === null ||
      row.statusChangedAt === null ||
      row.sourceUrl === null ||
      row.sourceLabel === null
    ) {
      return [];
    }
    return [
      {
        candidacyId: row.id,
        candidateName: row.candidateName,
        politicianSlug: row.politician.slug,
        photoUrl: row.politician.photoUrl,
        blobPhotoUrl: row.politician.blobPhotoUrl,
        statusLabel: isPrimaryDefeat(row.status, row.presidentialData?.withdrewReason)
          ? "Non retenue à la primaire"
          : CANDIDACY_STATUS_LABELS[row.status],
        changedAt: row.statusChangedAt,
        sourceLabel: row.sourceLabel,
        sourceHost: sourceHost(row.sourceUrl),
      },
    ];
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

function updateDate(update: HubLatestUpdate): number {
  return (update.kind === "status" ? update.changedAt : update.publishedAt).getTime();
}

/**
 * One row per candidacy, newest first. When a candidacy has both, its change of status is the
 * row shown unless a measure was published more than a day after it: a declaration followed the
 * same afternoon by a batch of measures is still, for the reader, the declaration.
 */
export function mergeHubLatestUpdates(
  measures: HubLatestMeasure[],
  statusChanges: HubStatusChange[]
): HubLatestUpdate[] {
  const byCandidacy = new Map<string, HubLatestUpdate>();
  for (const measure of measures)
    byCandidacy.set(measure.candidacyId, { kind: "measure", ...measure });
  for (const change of statusChanges) {
    const measure = byCandidacy.get(change.candidacyId);
    if (measure !== undefined && updateDate(measure) - change.changedAt.getTime() > DAY_MS)
      continue;
    byCandidacy.set(change.candidacyId, { kind: "status", ...change });
  }
  return [...byCandidacy.values()]
    .sort((a, b) => updateDate(b) - updateDate(a))
    .slice(0, HUB_LATEST_MEASURES_LIMIT);
}

/** Plain async, integration-testable. Pages call `getHubLatestUpdates`, which caches this. */
export async function loadHubLatestUpdates(electionId: string): Promise<HubLatestUpdate[]> {
  return observeRead("presidential.hub.latest", async () => {
    const [measures, statusChanges] = await Promise.all([
      queryHubLatestMeasures(electionId),
      queryHubStatusChanges(electionId),
    ]);
    return mergeHubLatestUpdates(measures, statusChanges);
  });
}

export async function getHubLatestUpdates(electionSlug: string): Promise<HubLatestUpdate[]> {
  const election = await db.election.findUnique({
    where: { slug: electionSlug },
    select: { id: true },
  });
  if (election === null) return [];
  return getHubLatestUpdatesCached(election.id);
}

/**
 * Same tags as the measure context: publishing a measure or changing a candidacy refreshes the
 * block on demand. No short profile, which would re-block the hub's 24 h ISR (AGENTS.md §5).
 */
async function getHubLatestUpdatesCached(electionId: string): Promise<HubLatestUpdate[]> {
  "use cache";
  cacheTag(`election-measures:${electionId}`);
  cacheTag(`election-candidacies:${electionId}`);
  cacheLife("synced");
  return loadHubLatestUpdates(electionId);
}
