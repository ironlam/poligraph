import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { ThemeCategory } from "@/generated/prisma";
import { db } from "@/lib/db";
import { isSubjectPagePublishable } from "@/config/publication-gates";
import { getPublicMeasureVoteRelations, type PublicVoteReference } from "@/lib/measures/vote-links";
import type { VoteRelation } from "@/lib/measures/vote-relation";
import { getPublicMeasuresByTheme, type PublicMeasure } from "./measures";
import {
  getPublicPresidentialCandidates,
  type PublicPresidentialCandidate,
} from "./presidential-candidates-public";

/**
 * The data of a public subject page: for one theme, each publicly visible candidacy and its published
 * measures on that theme, with the measure's relation to recorded votes.
 *
 * Every read goes through a public authority: `getPublicPresidentialCandidates` (drops DRAFT/missing
 * extensions), `getPublicMeasuresByTheme` (the single measure authority), and `getPublicMeasureVoteRelation`
 * (which never selects `rationale`/`reviewedBy`). Nothing here reads `db.measure`/`db.candidacy` directly.
 * The only direct read is the election slug -> id resolution, which is not gated.
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
};

/**
 * Plain async, integration-testable. Callers on a page use `getSubjectPageData`, which caches this.
 */
export async function loadSubjectPageData(
  electionId: string,
  electionSlug: string,
  theme: ThemeCategory
): Promise<SubjectPageData> {
  const [candidates, measures] = await Promise.all([
    getPublicPresidentialCandidates(electionSlug),
    // Withdrawn measures stay visible on a subject page (a dropped position is still information), so the
    // read includes them; the gate below counts only the ones still defended.
    getPublicMeasuresByTheme(electionId, theme, { includeWithdrawn: true }),
  ]);

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

  return {
    theme,
    electionSlug,
    candidates: entries,
    candidaciesWithVerifiedMeasure,
    publishable: isSubjectPagePublishable(candidaciesWithVerifiedMeasure),
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
  cacheLife("synced");
  return loadSubjectPageData(electionId, electionSlug, theme);
}
