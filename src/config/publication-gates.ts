/**
 * Publication gates, policy v1 (spec §4, arbitrated by Lamine on 2026-08-06).
 *
 * One place, evaluated by the data layer. A surface below its gate renders an explicit state and is
 * `robots: noindex`; it never renders a silently degraded comparison. These are validated values, not
 * proposals: changing one changes editorial policy, so it belongs here and nowhere else.
 */

export const PUBLICATION_GATES = {
  /** Fiche candidat : sourced status and at least one verified measure backed by a primary source. */
  ficheCandidat: {
    requiresSourcedStatus: true,
    minVerifiedMeasuresWithPrimarySource: 1,
  },
  /** Page sujet comparable : at least two candidacies with a verified measure on the subject. */
  pageSujet: {
    minCandidaciesWithVerifiedMeasure: 2,
  },
  /** Page priorités : the four cumulative conditions per included candidacy. */
  priorites: {
    minVerifiedMeasures: 15,
    minThemesCovered: 5,
    totalThemes: 13,
    minPrimarySourceShare: 0.6,
    /** Ratio between the best and least documented candidacy included. */
    maxCoverageRatio: 3,
  },
  /** Questions : reviewed count, validated search test set, applied retention policy. */
  questions: {
    minReviewedQuestions: 30,
    requiresValidatedTestSet: true,
    requiresRetentionPolicy: true,
  },
  /** Hub racine : publishable as soon as at least one subject page is. */
  hub: {
    minPublishableSubjectPages: 1,
  },
} as const;

/** A subject page is comparable once enough candidacies have a verified measure on the subject. */
export function isSubjectPagePublishable(candidaciesWithVerifiedMeasure: number): boolean {
  return (
    candidaciesWithVerifiedMeasure >= PUBLICATION_GATES.pageSujet.minCandidaciesWithVerifiedMeasure
  );
}

/** A candidate fiche exists once the status is sourced and at least one primary-sourced measure is verified. */
export function isFicheCandidatPublishable(params: {
  statusSourced: boolean;
  verifiedMeasuresWithPrimarySource: number;
}): boolean {
  return (
    params.statusSourced &&
    params.verifiedMeasuresWithPrimarySource >=
      PUBLICATION_GATES.ficheCandidat.minVerifiedMeasuresWithPrimarySource
  );
}

/** The root hub is publishable once at least one subject page is. */
export function isHubPublishable(publishableSubjectPages: number): boolean {
  return publishableSubjectPages >= PUBLICATION_GATES.hub.minPublishableSubjectPages;
}
