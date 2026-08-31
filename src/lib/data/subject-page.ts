import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { ThemeCategory } from "@/generated/prisma";
import { db } from "@/lib/db";
import { PUBLICATION_GATES, isSubjectPagePublishable } from "@/config/publication-gates";
import { getPublicMeasureVoteRelations, type PublicVoteReference } from "@/lib/measures/vote-links";
import type { VoteRelation } from "@/lib/measures/vote-relation";
import {
  getLatestPresidentialReviewDate,
  getPublicMeasuresByTheme,
  type PublicMeasure,
} from "./measures";
import {
  getPublicPresidentialCandidates,
  type PublicPresidentialCandidate,
} from "./presidential-candidates-public";
import { loadThemesIndex } from "./themes-index";

/**
 * The data of a public subject page: for one theme, each publicly visible candidacy and its published
 * measures on that theme, with the measure's relation to recorded votes.
 *
 * Content reads go through a public authority: `getPublicPresidentialCandidates` (drops DRAFT/missing
 * extensions), `getPublicMeasuresByTheme` (the single measure authority), and `getPublicMeasureVoteRelation`
 * (which never selects `rationale`/`reviewedBy`). Two direct reads bypass those authorities, but only to
 * produce a number, never content: `db.candidacy.count` (sourced candidacies of the election, the coverage
 * denominator) and `db.measure.count` (measures whose active revision awaits review, for
 * `pendingReviewRevisionCount`). The
 * election slug -> id resolution is a third direct read, and is not gated. No unpublished text ever crosses
 * this surface.
 *
 * `publishable` is the section 4 gate, not a rendering detail: below it the page shows an explicit state
 * and is noindex, never a silently degraded one-candidate "comparison".
 */

export type SubjectMeasure = {
  measure: PublicMeasure;
  voteRelation: VoteRelation;
  /** The sourced basis of the reference link, if any. Never carries rationale. */
  voteReference: PublicVoteReference | null;
};

export type SubjectCandidateEntry = {
  candidate: PublicPresidentialCandidate;
  /** Empty when the candidacy has no published measure on this theme: the page renders a qualified absence. */
  measures: SubjectMeasure[];
};

export type SubjectPageData = {
  theme: ThemeCategory;
  electionSlug: string;
  candidates: SubjectCandidateEntry[];
  /** Candidacies with at least one currently-defended (non-withdrawn) published measure on the theme. */
  candidaciesWithVerifiedMeasure: number;
  publishable: boolean;
  /** The publication gate this theme is measured against (spec §4, `PUBLICATION_GATES.pageSujet`). */
  requiredCandidaciesWithVerifiedMeasure: number;
  /** Candidacies of the election with a sourced editorial status, the denominator of the coverage rate. */
  totalSourcedCandidacies: number;
  /**
   * Measures of the theme whose ACTIVE revision has not been reviewed yet: not reviewed, not
   * discarded, not superseded, on a measure that was never depublished. One active revision per
   * measure, so this counts measures and revisions alike. Count only, never the draft text.
   */
  pendingReviewRevisionCount: number;
  /** When the most recently reviewed public measure on this theme was reviewed, if any. */
  lastReviewedAt: Date | null;
  /** Another theme that already clears the gate, to redirect to when this one does not. */
  fallbackPublishableTheme: { slug: string; label: string } | null;
  /**
   * The thirteen subjects with their currently-defended measure count, in editorial order, for the
   * navigation the page carries alongside its own content. Read from the themes index
   * already loaded here, so the sidebar costs no extra query.
   */
  siblingThemes: {
    theme: ThemeCategory;
    label: string;
    slug: string;
    measureCount: number;
    publishable: boolean;
  }[];
  /** Currently-defended measures on this theme, across the whole published population. */
  totalMeasuresOnTheme: number;
  /** Reviewed technical terms present in currently defended measures on this theme. */
  readerGuides: Array<{ slug: string; label: string; measureCount: number }>;
};

/**
 * Plain async, integration-testable. Callers on a page use `getSubjectPageData`, which caches this.
 */
export async function loadSubjectPageData(
  electionId: string,
  electionSlug: string,
  theme: ThemeCategory
): Promise<SubjectPageData> {
  const [
    candidates,
    measures,
    totalSourcedCandidacies,
    pendingReviewRevisionCount,
    lastReviewedAt,
    themesIndex,
  ] = await Promise.all([
    getPublicPresidentialCandidates(electionSlug),
    // Withdrawn measures stay visible on a subject page (a dropped position is still information), so the
    // read includes them; the gate below counts only the ones still defended.
    getPublicMeasuresByTheme(electionId, theme, { includeWithdrawn: true }),
    db.candidacy.count({
      where: {
        electionId,
        status: { not: null },
        sourceUrl: { not: null },
        sourceLabel: { not: null },
      },
    }),
    // Count only: never expose the text of an unpublished revision here.
    //
    // The predicate is on the ACTIVE REVISION, not on the measure's publication status. Counting
    // `publicationStatus: "DRAFT"` answered a different question and got both ends wrong: it
    // missed a PUBLISHED measure carrying a new, unreviewed correction (the most common case of
    // "awaiting review" once a subject is live), and it counted a DRAFT measure whose latest
    // revision had already been reviewed and was merely waiting to be published.
    //
    // `depublishedAt: null` stays, and is not redundant with the revision predicate:
    // depublishMeasure() sets publicationStatus back to DRAFT, and a measure we withdrew for
    // cause is not "awaiting review" even when its active revision was never reviewed.
    db.measure.count({
      where: {
        electionId,
        theme,
        depublishedAt: null,
        latestRevision: { is: { reviewedAt: null, discardedAt: null, supersededAt: null } },
      },
    }),
    getLatestPresidentialReviewDate(electionId, theme),
    loadThemesIndex(electionId, electionSlug),
  ]);

  const fallback = themesIndex.themes.find((t) => t.publishable && t.theme !== theme) ?? null;
  const fallbackPublishableTheme = fallback ? { slug: fallback.slug, label: fallback.label } : null;

  const measuresByCandidacy = new Map<string, PublicMeasure[]>();
  for (const measure of measures) {
    // A measure not tied to a candidacy has no column on a candidate comparison.
    if (measure.candidacyId === null) continue;
    const list = measuresByCandidacy.get(measure.candidacyId) ?? [];
    list.push(measure);
    measuresByCandidacy.set(measure.candidacyId, list);
  }

  // One batched read for every measure's vote relation, instead of one query per measure (N+1).
  const relations = await getPublicMeasureVoteRelations(
    measures.map((measure) => ({
      measureId: measure.id,
      publishedRevisionId: measure.publishedRevisionId,
    }))
  );

  const entries: SubjectCandidateEntry[] = [];
  let candidaciesWithVerifiedMeasure = 0;

  for (const candidate of candidates) {
    const candidateMeasures = measuresByCandidacy.get(candidate.id) ?? [];
    const subjectMeasures: SubjectMeasure[] = candidateMeasures.map((measure) => {
      const relation = relations.get(measure.id);
      return {
        measure,
        voteRelation: relation?.relation ?? "SEARCH_NOT_DONE",
        voteReference: relation?.reference ?? null,
      };
    });
    if (candidateMeasures.some((measure) => measure.withdrawal === null)) {
      candidaciesWithVerifiedMeasure += 1;
    }
    entries.push({ candidate, measures: subjectMeasures });
  }

  const readerGuideCounts = new Map<string, { label: string; measureIds: Set<string> }>();
  for (const measure of measures) {
    if (measure.withdrawal !== null) continue;
    for (const guide of measure.readerGuides) {
      const current = readerGuideCounts.get(guide.slug) ?? {
        label: guide.label,
        measureIds: new Set<string>(),
      };
      current.measureIds.add(measure.id);
      readerGuideCounts.set(guide.slug, current);
    }
  }

  return {
    theme,
    electionSlug,
    candidates: entries,
    candidaciesWithVerifiedMeasure,
    publishable: isSubjectPagePublishable(candidaciesWithVerifiedMeasure),
    requiredCandidaciesWithVerifiedMeasure:
      PUBLICATION_GATES.pageSujet.minCandidaciesWithVerifiedMeasure,
    totalSourcedCandidacies,
    pendingReviewRevisionCount,
    lastReviewedAt,
    fallbackPublishableTheme,
    siblingThemes: themesIndex.themes.map((t) => ({
      theme: t.theme,
      label: t.label,
      slug: t.slug,
      measureCount: t.currentlyDefendedMeasureCount,
      publishable: t.publishable,
    })),
    totalMeasuresOnTheme:
      themesIndex.themes.find((t) => t.theme === theme)?.currentlyDefendedMeasureCount ?? 0,
    readerGuides: [...readerGuideCounts.entries()]
      .map(([slug, guide]) => ({
        slug,
        label: guide.label,
        measureCount: guide.measureIds.size,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr")),
  };
}

/**
 * Cached read for the page. The election id is resolved uncached (cheap), then the heavy reads run inside
 * a `"use cache"` boundary tagged `election-measures:${electionId}`, the same tag the measure writes bust.
 */
export async function getSubjectPageData(
  electionSlug: string,
  theme: ThemeCategory
): Promise<SubjectPageData | null> {
  const election = await db.election.findUnique({
    where: { slug: electionSlug },
    select: { id: true },
  });
  if (election === null) return null;
  return getSubjectPageDataCached(election.id, electionSlug, theme);
}

async function getSubjectPageDataCached(
  electionId: string,
  electionSlug: string,
  theme: ThemeCategory
): Promise<SubjectPageData> {
  "use cache";
  cacheTag(`election-measures:${electionId}`);
  // This read also filters on CandidacyPresidential.publicationStatus. Without this second tag,
  // publishing an extension busted nothing here and the surface stayed closed for 24h.
  cacheTag(`election-candidacies:${electionId}`);
  cacheLife("synced");
  return loadSubjectPageData(electionId, electionSlug, theme);
}
