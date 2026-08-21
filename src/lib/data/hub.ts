import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { CandidacyStatus, ThemeCategory } from "@/generated/prisma";
import { PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";
import { db } from "@/lib/db";
import { isHubPublishable } from "@/config/publication-gates";
import { resolveCandidateAccentColor } from "@/lib/presidentielle/candidate-accent";
import { sortPresidentialCandidatesBySurname } from "@/lib/presidentielle/candidate-order";
import {
  resolveProgrammeAbsence,
  rollupMeasuresByCandidacy,
} from "@/lib/presidentielle/candidacy-rollup";
import { getPublicPresidentialCandidates } from "./presidential-candidates-public";
import { loadThemesIndex } from "./themes-index";
import { getLatestPresidentialReviewDate, getPublicMeasuresByElection } from "./measures";

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

export type HubCandidacy = {
  id: string;
  candidateName: string;
  politicianSlug: string;
  photoUrl: string | null;
  blobPhotoUrl: string | null;
  status: CandidacyStatus | null;
  sourceUrl: string | null;
  sourceLabel: string | null;
  partyLabel: string | null;
  /**
   * The visual identity. The colour follows the same resolver as the subject pages, while the short
   * name and logo still require a linked party entity.
   */
  partyColor: string | null;
  partyShortName: string | null;
  partyLogoUrl: string | null;
  /** Currently defended public measures, withdrawals excluded. */
  measureCount: number;
  /** Distinct themes those measures cover, out of the thirteen. */
  themesCoveredCount: number;
  /**
   * Why the measure count is zero, and never a bare zero.
   *
   * `aucun_programme` documents the CANDIDACY: nothing has been published for this election.
   * `non_depouille` documents US: a programme exists and we have not extracted it yet. Presenting
   * our own backlog as a candidate's silence would be a false claim about a person, so the two are
   * distinct values and the display renders different sentences for them.
   *
   * Null when `measureCount > 0`, since there is then no absence to qualify.
   */
  programmeAbsence: "aucun_programme" | "non_depouille" | null;
};

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
};

/**
 * Not cached: ~11 rows today, and candidacy status/source edits have no invalidation path yet, so
 * caching this read would have nothing to bust it on a write. Real freshness still tops out at the
 * page's own `revalidate = 86400`: this function itself always reads live, but the rendered page
 * that calls it is only as fresh as its ISR backstop.
 */
export async function getHubCandidacyField(electionSlug: string): Promise<HubCandidacy[]> {
  const election = await db.election.findFirst({
    where: { slug: electionSlug },
    select: { id: true },
  });
  if (election === null) return [];

  const [rows, measures, publicCandidates, editions] = await Promise.all([
    db.candidacy.findMany({
      // The field is the race, not the published fiches: sourced candidacies (status + both
      // source fields non-null), no extension required. Alphabetical order.
      where: {
        electionId: election.id,
        status: { not: null },
        sourceUrl: { not: null },
        sourceLabel: { not: null },
        politicianId: { not: null },
        politician: PUBLIC_POLITICIAN_WHERE,
      },
      select: {
        id: true,
        candidateName: true,
        status: true,
        sourceUrl: true,
        sourceLabel: true,
        partyLabel: true,
        presidentialData: { select: { accentColor: true, publicationStatus: true } },
        politician: {
          select: {
            slug: true,
            lastName: true,
            photoUrl: true,
            blobPhotoUrl: true,
            currentParty: { select: { color: true, name: true, shortName: true } },
          },
        },
        party: { select: { color: true, name: true, shortName: true, logoUrl: true } },
      },
    }),
    // Defended measures only: `getPublicMeasuresByElection` drops withdrawals unless asked, and a
    // proposal a candidate has dropped is not one they still carry.
    getPublicMeasuresByElection(election.id),
    // The subject-page population, used to intersect those measures. Same read and same reason as
    // `loadThemesIndex`: a measure on a DRAFT-extension candidacy is rendered nowhere, so counting
    // it on this row would advertise work the reader cannot reach (invariant I7).
    getPublicPresidentialCandidates(electionSlug),
    // A party platform is not a candidate programme without an explicit editorial attribution.
    // Only editions directly owned by the candidacy can qualify this candidate-level state.
    db.programEdition.findMany({
      where: {
        electionId: election.id,
        publicationStatus: "PUBLISHED",
        candidacyId: { not: null },
      },
      select: { candidacyId: true },
    }),
  ]);

  const byCandidacy = rollupMeasuresByCandidacy(
    measures.map((m) => ({
      candidacyId: m.candidacyId,
      theme: m.theme,
      hasPrimarySource: m.sources.some((s) => s.tier === "PRIMARY"),
    })),
    new Set(publicCandidates.map((c) => c.id))
  );

  const editionCandidacyIds = new Set(
    editions.map((e) => e.candidacyId).filter((id): id is string => id !== null)
  );
  return sortPresidentialCandidatesBySurname(rows).flatMap((c) => {
    if (c.politician === null) return [];
    const rollup = byCandidacy.get(c.id);
    const measureCount = rollup?.measureCount ?? 0;
    const hasProgramme = editionCandidacyIds.has(c.id);

    return [
      {
        id: c.id,
        candidateName: c.candidateName,
        politicianSlug: c.politician.slug,
        photoUrl: c.politician.photoUrl,
        blobPhotoUrl: c.politician.blobPhotoUrl,
        status: c.status,
        sourceUrl: c.sourceUrl,
        sourceLabel: c.sourceLabel,
        partyLabel: c.partyLabel ?? c.party?.shortName ?? c.party?.name ?? null,
        partyColor: resolveCandidateAccentColor({
          // The hub includes candidacies without a published presidential extension. Use an editorial
          // accent only after that extension clears its publication gate, otherwise fall back to the
          // candidacy's public party data.
          accentColor:
            c.presidentialData?.publicationStatus === "PUBLISHED"
              ? c.presidentialData.accentColor
              : null,
          candidacyParty: c.party,
          partyLabel: c.partyLabel,
          currentParty: c.politician?.currentParty ?? null,
        }),
        partyShortName: c.party?.shortName ?? null,
        partyLogoUrl: c.party?.logoUrl ?? null,
        measureCount,
        themesCoveredCount: rollup?.themesCoveredCount ?? 0,
        programmeAbsence: resolveProgrammeAbsence(measureCount, hasProgramme),
        // Evaluated with the gate the fiche itself uses, not re-derived from `measureCount`.
        // The row is what decides which link to offer, so a disagreement between the two
        // would send the reader to a page that redirects them somewhere else without a word.
      },
    ];
  });
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
