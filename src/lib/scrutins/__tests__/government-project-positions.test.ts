import { describe, expect, it } from "vitest";
import {
  evaluateOfficialGroupPosition,
  getDominantGovernmentProjectPosition,
  summarizeGovernmentProjectPositions,
  validateOfficialGroupTotals,
} from "../government-project-positions";

const row = {
  organeRef: "PO845401",
  forCount: 6,
  againstCount: 2,
  abstainCount: 4,
  majorityPosition: "POUR",
  issues: [],
};

describe("positions sur les projets gouvernementaux", () => {
  it("retient la position strictement dominante", () => {
    expect(
      getDominantGovernmentProjectPosition({ forCount: 6, againstCount: 2, abstainCount: 4 })
    ).toBe("POUR");
    expect(
      getDominantGovernmentProjectPosition({ forCount: 2, againstCount: 5, abstainCount: 3 })
    ).toBe("CONTRE");
    expect(
      getDominantGovernmentProjectPosition({ forCount: 1, againstCount: 2, abstainCount: 4 })
    ).toBe("ABSTENTION");
  });

  it("exclut toute égalité au maximum, y compris zéro partout", () => {
    expect(
      getDominantGovernmentProjectPosition({ forCount: 4, againstCount: 4, abstainCount: 1 })
    ).toBeNull();
    expect(
      getDominantGovernmentProjectPosition({ forCount: 0, againstCount: 0, abstainCount: 0 })
    ).toBeNull();
  });

  it("échoue de façon explicite sur une source ambiguë, incomplète ou contradictoire", () => {
    expect(evaluateOfficialGroupPosition([row], [])).toMatchObject({
      exclusion: "GROUP_REFERENCE_MISSING",
    });
    expect(evaluateOfficialGroupPosition([], ["PO845401"])).toMatchObject({
      exclusion: "GROUP_SNAPSHOT_MISSING",
    });
    expect(evaluateOfficialGroupPosition([row, row], ["PO845401"])).toMatchObject({
      exclusion: "GROUP_SNAPSHOT_AMBIGUOUS",
    });
    expect(evaluateOfficialGroupPosition([{ ...row, forCount: null }], ["PO845401"])).toMatchObject(
      {
        exclusion: "COUNTS_INCOMPLETE",
      }
    );
    expect(
      evaluateOfficialGroupPosition([{ ...row, majorityPosition: "CONTRE" }], ["PO845401"])
    ).toMatchObject({ exclusion: "MAJORITY_MISMATCH" });
  });

  it("ignore les diagnostics sans effet sur les trois positions calculées", () => {
    expect(
      evaluateOfficialGroupPosition(
        [
          {
            ...row,
            majorityPosition: null,
            issues: [
              "memberCount: valeur absente",
              "nonVoterCount: valeur absente",
              "majorityPosition: valeur absente",
            ],
          },
        ],
        ["PO845401"]
      )
    ).toMatchObject({ position: "POUR", exclusion: null });
  });

  it("contrôle les totaux officiels avant tout calcul par groupe", () => {
    expect(
      validateOfficialGroupTotals([row], { votesFor: 6, votesAgainst: 2, votesAbstain: 4 })
    ).toBeNull();
    expect(
      validateOfficialGroupTotals([row], { votesFor: 7, votesAgainst: 2, votesAbstain: 4 })
    ).toBe("OFFICIAL_GROUP_TOTALS_MISMATCH");
  });

  it("affiche trois parts séparées avec le même dénominateur", () => {
    const summary = summarizeGovernmentProjectPositions([
      { ...row, position: "POUR", exclusion: null },
      { ...row, position: "ABSTENTION", exclusion: null },
      { ...row, position: "CONTRE", exclusion: null },
      { ...row, position: "POUR", exclusion: null },
      { ...row, position: null, exclusion: "POSITION_TIE" },
    ]);

    expect(summary).toEqual({
      consideredCount: 4,
      excludedCount: 1,
      counts: { POUR: 2, ABSTENTION: 1, CONTRE: 1 },
      percentages: { POUR: 50, ABSTENTION: 25, CONTRE: 25 },
    });
  });
});
