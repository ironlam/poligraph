import { describe, expect, it } from "vitest";
import {
  PUBLICATION_GATES,
  isFicheCandidatPublishable,
  isHubPublishable,
  isSubjectPagePublishable,
} from "../publication-gates";

/**
 * Policy v1 locked. These are validated editorial thresholds, not proposals: a change here changes what
 * gets published and indexed, so the values are asserted verbatim to make any drift a deliberate,
 * reviewed edit.
 */
describe("publication-gates : politique v1 verrouillée", () => {
  it("porte exactement les seuils arbitrés", () => {
    expect(PUBLICATION_GATES.ficheCandidat.minVerifiedMeasuresWithPrimarySource).toBe(1);
    expect(PUBLICATION_GATES.ficheCandidat.requiresSourcedStatus).toBe(true);
    expect(PUBLICATION_GATES.pageSujet.minCandidaciesWithVerifiedMeasure).toBe(2);
    expect(PUBLICATION_GATES.priorites.minVerifiedMeasures).toBe(15);
    expect(PUBLICATION_GATES.priorites.minThemesCovered).toBe(5);
    expect(PUBLICATION_GATES.priorites.totalThemes).toBe(13);
    expect(PUBLICATION_GATES.priorites.minPrimarySourceShare).toBe(0.6);
    expect(PUBLICATION_GATES.priorites.maxCoverageRatio).toBe(3);
    expect(PUBLICATION_GATES.questions.minReviewedQuestions).toBe(30);
    expect(PUBLICATION_GATES.hub.minPublishableSubjectPages).toBe(1);
  });
});

describe("publication-gates : évaluateurs au seuil et en dessous", () => {
  it("page sujet : publiable à 2 candidatures, pas à 1", () => {
    expect(isSubjectPagePublishable(2)).toBe(true);
    expect(isSubjectPagePublishable(1)).toBe(false);
    expect(isSubjectPagePublishable(0)).toBe(false);
  });

  it("fiche candidat : exige un statut sourcé ET une mesure vérifiée à source primaire", () => {
    expect(
      isFicheCandidatPublishable({ statusSourced: true, verifiedMeasuresWithPrimarySource: 1 })
    ).toBe(true);
    expect(
      isFicheCandidatPublishable({ statusSourced: false, verifiedMeasuresWithPrimarySource: 3 })
    ).toBe(false);
    expect(
      isFicheCandidatPublishable({ statusSourced: true, verifiedMeasuresWithPrimarySource: 0 })
    ).toBe(false);
  });

  it("hub : publiable dès une page sujet publiable", () => {
    expect(isHubPublishable(1)).toBe(true);
    expect(isHubPublishable(0)).toBe(false);
  });
});
