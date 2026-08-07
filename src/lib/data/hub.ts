import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { CandidacyStatus } from "@/generated/prisma";
import { db } from "@/lib/db";
import { isHubPublishable } from "@/config/publication-gates";
import { loadThemesIndex } from "./themes-index";
import { getLatestPresidentialReviewDate } from "./measures";

/**
 * The two read authorities for the presidential hub page.
 *
 * The candidacy field and the published fiches are two different populations, and this file
 * exists to keep them that way. `getHubCandidacyField` shows the whole race — every sourced
 * candidacy (status + `sourceUrl` + `sourceLabel` non-null), pressenti/envisagé included,
 * extension NOT required — because the hub has to show the field before anyone has a published
 * fiche. Routing it through `getPublicPresidentialCandidates` (the PUBLISHED-extension
 * population used by the subject pages) would empty the hub at launch.
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
  politicianSlug: string | null;
  status: CandidacyStatus | null;
  sourceUrl: string | null;
  sourceLabel: string | null;
  partyLabel: string | null;
  /**
   * The party as an ENTITY, when the candidacy is linked to one. `partyLabel` is the wording of
   * the source and stays authoritative for the text; these three carry the visual identity, and
   * they are all null on a candidacy whose `partyId` was never resolved.
   */
  partyColor: string | null;
  partyShortName: string | null;
  partyLogoUrl: string | null;
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
};

/**
 * Not cached: ~11 rows today, and candidacy status/source edits have no invalidation path yet, so
 * caching this read would have nothing to bust it on a write. Real freshness still tops out at the
 * page's own `revalidate = 86400`: this function itself always reads live, but the rendered page
 * that calls it is only as fresh as its ISR backstop.
 */
export async function getHubCandidacyField(electionSlug: string): Promise<HubCandidacy[]> {
  const rows = await db.candidacy.findMany({
    // The field is the race, not the published fiches: sourced candidacies (status + both
    // source fields non-null), no extension required. Alphabetical order.
    where: {
      election: { slug: electionSlug },
      status: { not: null },
      sourceUrl: { not: null },
      sourceLabel: { not: null },
    },
    select: {
      id: true,
      candidateName: true,
      status: true,
      sourceUrl: true,
      sourceLabel: true,
      partyLabel: true,
      politician: { select: { slug: true, lastName: true } },
      party: { select: { color: true, shortName: true, logoUrl: true } },
    },
  });

  // Sorted by SURNAME, which is what the page announces. `candidateName` is "Prénom Nom", so ordering
  // on it in SQL sorts by first name: "Édouard Philippe" would land under E, not P. The surname comes
  // from the linked politician, which is where the database actually separates the two; a candidacy
  // without a politician falls back to its full name rather than being dropped.
  // localeCompare with "fr" so accents sort where a French reader expects (É with E, not after Z).
  const collator = new Intl.Collator("fr", { sensitivity: "base" });
  const sortKey = (c: (typeof rows)[number]) => c.politician?.lastName ?? c.candidateName;
  rows.sort(
    (a, b) =>
      collator.compare(sortKey(a), sortKey(b)) || collator.compare(a.candidateName, b.candidateName)
  );

  return rows.map((c) => ({
    id: c.id,
    candidateName: c.candidateName,
    politicianSlug: c.politician?.slug ?? null,
    status: c.status,
    sourceUrl: c.sourceUrl,
    sourceLabel: c.sourceLabel,
    partyLabel: c.partyLabel,
    partyColor: c.party?.color ?? null,
    partyShortName: c.party?.shortName ?? null,
    partyLogoUrl: c.party?.logoUrl ?? null,
  }));
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
