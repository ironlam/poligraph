import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { CandidacyStatus } from "@/generated/prisma";
import { db } from "@/lib/db";
import { PRESIDENTIELLE_2027_SLUG } from "@/lib/presidentielle/themes";
import { getPublicMeasureStatsByCandidacy } from "./measures";

/**
 * The reverse of `getHubCandidacyField`: "the presidential candidacy of THIS politician".
 *
 * One doctrine governs this file, and it is a split between two populations:
 *
 * - identity, status and source are read WITHOUT the PUBLISHED-extension filter. A candidacy can be
 *   sourced and public knowledge months before anyone publishes its editorial extension, so
 *   filtering here would make the notice disappear from every fiche it exists for;
 * - measure counters are read WITH it, through `getPublicMeasureStatsByCandidacy`. Counting a
 *   measure that no subject page renders would announce measures the reader cannot reach.
 *
 * The same split is documented in `hub.ts` for the hub page. It is restated here because the
 * politician fiche is not the hub, and a reader of this file should not have to go looking.
 *
 * Scoped to the presidential election on purpose. No other election uses `CandidacyStatus` today,
 * so a generic "candidacy for the current election" would be speculative generality.
 */
export type PoliticianCandidacy = {
  electionSlug: string;
  electionShortTitle: string;
  round1Date: Date | null;
  round2Date: Date | null;
  /** Non-null: a candidacy without a sourced status is not returned at all. */
  status: CandidacyStatus;
  sourceUrl: string;
  sourceLabel: string;
  declaredAt: Date | null;
  withdrewAt: Date | null;
  publishedMeasureCount: number;
  themesCoveredCount: number;
  primarySourceMeasureCount: number;
  lastReviewedAt: Date | null;
  round1Pct: number | null;
  round2Pct: number | null;
  isElected: boolean;
};

/**
 * Plain async, integration-testable. Pages call `getPoliticianPresidentialCandidacy`, which caches
 * this: a `"use cache"` boundary throws outside a Next request context, the same reason
 * `loadHubMeasureContext` and `loadSubjectPageData` are split this way.
 */
export async function loadPoliticianPresidentialCandidacy(
  politicianId: string
): Promise<PoliticianCandidacy | null> {
  const row = await db.candidacy.findFirst({
    where: {
      politicianId,
      election: { slug: PRESIDENTIELLE_2027_SLUG },
      // The three conditions that make the notice sayable at all. Without them there is no state to
      // render: the notice has no "I do not know" state, it simply does not appear.
      status: { not: null },
      sourceUrl: { not: null },
      sourceLabel: { not: null },
    },
    select: {
      id: true,
      status: true,
      sourceUrl: true,
      sourceLabel: true,
      round1Pct: true,
      round2Pct: true,
      isElected: true,
      election: {
        select: { slug: true, title: true, shortTitle: true, round1Date: true, round2Date: true },
      },
      presidentialData: { select: { declaredAt: true, withdrewAt: true } },
    },
  });

  // Narrowing the three nullable columns the where clause already excluded. Defensive rather than
  // redundant: this is the only place that turns them into non-nullable fields.
  if (!row || row.status === null || row.sourceUrl === null || row.sourceLabel === null) {
    return null;
  }

  const stats = await getPublicMeasureStatsByCandidacy(row.id);

  return {
    electionSlug: row.election.slug,
    electionShortTitle: row.election.shortTitle ?? row.election.title,
    round1Date: row.election.round1Date,
    round2Date: row.election.round2Date,
    status: row.status,
    sourceUrl: row.sourceUrl,
    sourceLabel: row.sourceLabel,
    declaredAt: row.presidentialData?.declaredAt ?? null,
    withdrewAt: row.presidentialData?.withdrewAt ?? null,
    publishedMeasureCount: stats.measureCount,
    themesCoveredCount: stats.themesCoveredCount,
    primarySourceMeasureCount: stats.primarySourceMeasureCount,
    lastReviewedAt: stats.lastReviewedAt,
    round1Pct: row.round1Pct === null ? null : Number(row.round1Pct),
    round2Pct: row.round2Pct === null ? null : Number(row.round2Pct),
    isElected: row.isElected,
  };
}

/**
 * Cached read for the politician fiche, carrying BOTH tags of the presidential surfaces.
 *
 * `election-candidacies` because the notice's state depends on `CandidacyPresidential`
 * publicationStatus through its measure counters, and `election-measures` because those counters
 * move on a measure publication. Omitting either would recreate the exact debt #678 paid off: the
 * four hub reads carried only the measures tag while the extension mutations purged `elections`, two
 * sets that do not overlap, so a DRAFT to PUBLISHED transition busted nothing and the surfaces
 * stayed closed for 24h with the data already in place.
 *
 * The election id is resolved first because both tags are keyed on it, and the slug alone cannot
 * name them.
 */
export async function getPoliticianPresidentialCandidacy(
  politicianId: string
): Promise<PoliticianCandidacy | null> {
  const election = await db.election.findUnique({
    where: { slug: PRESIDENTIELLE_2027_SLUG },
    select: { id: true },
  });
  if (election === null) return null;
  return getPoliticianPresidentialCandidacyCached(politicianId, election.id);
}

async function getPoliticianPresidentialCandidacyCached(
  politicianId: string,
  electionId: string
): Promise<PoliticianCandidacy | null> {
  "use cache";
  cacheTag(`election-measures:${electionId}`);
  cacheTag(`election-candidacies:${electionId}`);
  cacheLife("synced");
  return loadPoliticianPresidentialCandidacy(politicianId);
}
