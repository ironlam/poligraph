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
  /**
   * Page priorités. Three conditions are evaluated per candidacy; the fourth (the coverage
   * ratio) is a property of the included SET and cannot be evaluated on one candidacy alone,
   * which is why `maxCoverageRatio` is read by `isPrioritesPublishable` and not by
   * `isPrioritesCandidacyEligible`. Mockup `Etats limites.dc.html` § 3 lays them out the same
   * way: three table columns, then a separate block of conditions that depend on no candidacy.
   */
  priorites: {
    minVerifiedMeasures: 15,
    minThemesCovered: 5,
    totalThemes: THEMES_IN_ORDER.length,
    minPrimarySourceShare: 0.6,
    /** Ratio between the best and least documented candidacy included. */
    maxCoverageRatio: 3,
    /** Below two eligible candidacies there is no comparison to render, only the calculation. */
    minEligibleCandidacies: 2,
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

/**
 * Editorial prerequisite of the priorities page (spec §4.1), and not a threshold: no number of
 * measures can satisfy it. A percentage per subject depends as much on how we cut the texts into
 * measures as on the weight the candidate gives the subject, so the page cannot open before the
 * segmentation doctrine is written, reviewed by two people independently, their level of agreement
 * measured, and the method published on the page itself.
 *
 * Annotated `boolean` rather than left to infer `false`: the literal type would let TypeScript
 * narrow every guard that reads it into dead code, and silently delete the branch that opens the
 * page on the day this flips.
 */
export const SEGMENTATION_DOCTRINE_PUBLISHED: boolean = false;

export type PrioritesCandidacyMetrics = {
  verifiedMeasureCount: number;
  themesCoveredCount: number;
  /** Share of verified measures carrying at least one primary source. Null with no measure. */
  primarySourceShare: number | null;
};

/**
 * The three conditions a single candidacy carries. A candidacy failing any of them is not
 * included in the comparison, and its absence is displayed with its reason: it is never dropped
 * silently from the list.
 */
export function isPrioritesCandidacyEligible(metrics: PrioritesCandidacyMetrics): boolean {
  const gate = PUBLICATION_GATES.priorites;
  return (
    metrics.verifiedMeasureCount >= gate.minVerifiedMeasures &&
    metrics.themesCoveredCount >= gate.minThemesCovered &&
    metrics.primarySourceShare !== null &&
    metrics.primarySourceShare >= gate.minPrimarySourceShare
  );
}

/**
 * The conditions that depend on no single candidacy. All four must hold, on top of every included
 * candidacy already clearing its own three.
 *
 * `coverageRatio` is null below two eligible candidacies (a ratio needs two terms), and that null
 * blocks publication rather than defaulting to a passing value: comparing 70 measures to 8 produces
 * a distribution that looks rigorous and is not.
 */
export function isPrioritesPublishable(params: {
  eligibleCount: number;
  coverageRatio: number | null;
  corpusSameNature: boolean;
  segmentationDoctrinePublished: boolean;
}): boolean {
  const gate = PUBLICATION_GATES.priorites;
  return (
    params.eligibleCount >= gate.minEligibleCandidacies &&
    params.coverageRatio !== null &&
    params.coverageRatio <= gate.maxCoverageRatio &&
    params.corpusSameNature &&
    params.segmentationDoctrinePublished
  );
}
import { THEMES_IN_ORDER } from "@/lib/presidentielle/themes";
