import { describe, expect, it } from "vitest";
import {
  PUBLICATION_GATES,
  SEGMENTATION_DOCTRINE_PUBLISHED,
  isFicheCandidatPublishable,
  isHubPublishable,
  isPrioritesCandidacyEligible,
  isPrioritesPublishable,
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
    expect(PUBLICATION_GATES.priorites.totalThemes).toBe(16);
    expect(PUBLICATION_GATES.priorites.minPrimarySourceShare).toBe(0.6);
    expect(PUBLICATION_GATES.priorites.maxCoverageRatio).toBe(3);
    expect(PUBLICATION_GATES.priorites.minEligibleCandidacies).toBe(2);
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

describe("priorités : les trois conditions portées par une candidature", () => {
  const auSeuil = { verifiedMeasureCount: 15, themesCoveredCount: 5, primarySourceShare: 0.6 };

  it("éligible pile aux trois seuils", () => {
    expect(isPrioritesCandidacyEligible(auSeuil)).toBe(true);
  });

  it("chaque condition suffit seule à exclure", () => {
    expect(isPrioritesCandidacyEligible({ ...auSeuil, verifiedMeasureCount: 14 })).toBe(false);
    expect(isPrioritesCandidacyEligible({ ...auSeuil, themesCoveredCount: 4 })).toBe(false);
    expect(isPrioritesCandidacyEligible({ ...auSeuil, primarySourceShare: 0.59 })).toBe(false);
  });

  it("une part de sources nulle n'est pas une part satisfaisante", () => {
    // Sans mesure, la part est null. Un `>=` sur null vaudrait 0 >= 0.6 en JavaScript après
    // coercition, donc false par accident ; ici c'est refusé explicitement, pas par chance.
    expect(
      isPrioritesCandidacyEligible({
        verifiedMeasureCount: 40,
        themesCoveredCount: 9,
        primarySourceShare: null,
      })
    ).toBe(false);
  });
});

describe("priorités : les conditions qui ne dépendent d'aucune candidature", () => {
  const toutesRéunies = {
    eligibleCount: 2,
    coverageRatio: 3,
    corpusSameNature: true,
    segmentationDoctrinePublished: true,
  };

  it("publiable quand les quatre tiennent, écart pile au maximum", () => {
    expect(isPrioritesPublishable(toutesRéunies)).toBe(true);
  });

  it("chaque condition suffit seule à fermer la page", () => {
    expect(isPrioritesPublishable({ ...toutesRéunies, eligibleCount: 1 })).toBe(false);
    expect(isPrioritesPublishable({ ...toutesRéunies, coverageRatio: 3.1 })).toBe(false);
    expect(isPrioritesPublishable({ ...toutesRéunies, corpusSameNature: false })).toBe(false);
    expect(isPrioritesPublishable({ ...toutesRéunies, segmentationDoctrinePublished: false })).toBe(
      false
    );
  });

  it("un écart non calculable ferme la page au lieu de la laisser passer", () => {
    // null veut dire « moins de deux candidatures éligibles », pas « écart satisfaisant ».
    expect(isPrioritesPublishable({ ...toutesRéunies, coverageRatio: null })).toBe(false);
  });

  it("la doctrine de segmentation n'est pas publiée, donc la page reste fermée", () => {
    // Ce test tombe le jour où la doctrine est publiée, et c'est le but : la bascule est un acte
    // éditorial délibéré, qui doit passer par une modification vue en revue.
    expect(SEGMENTATION_DOCTRINE_PUBLISHED).toBe(false);
  });
});
