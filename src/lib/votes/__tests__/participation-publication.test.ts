import { describe, expect, it } from "vitest";
import {
  isParticipationPublishable,
  participationStatusFor,
  resolveCurrentParliamentaryMandate,
  resolveParticipationStatus,
  roundParticipationRate,
} from "@/lib/votes/participation-publication";

describe("politique de publication de la participation", () => {
  it("exige une politique explicite par chambre", () => {
    expect(
      isParticipationPublishable({
        chamber: "AN",
        hasApplicableMandate: true,
        eligibleScrutins: 20,
        methodSupported: true,
      })
    ).toBe(true);
    expect(
      isParticipationPublishable({
        chamber: "SENAT",
        hasApplicableMandate: true,
        eligibleScrutins: 20,
        methodSupported: true,
      })
    ).toBe(false);
    expect(isParticipationPublishable(undefined)).toBe(false);
    expect(
      isParticipationPublishable({
        chamber: undefined,
        hasApplicableMandate: true,
        eligibleScrutins: 20,
        methodSupported: true,
      })
    ).toBe(false);
    expect(participationStatusFor("SENAT")).toBe("SOURCE_INSUFFICIENT");
    expect(participationStatusFor(undefined)).toBe("COMPUTATION_INCOMPLETE");
  });

  it.each([
    [
      { chamber: "SENAT", hasApplicableMandate: true, eligibleScrutins: 20, methodSupported: true },
      "SOURCE_INSUFFICIENT",
    ],
    [
      {
        chamber: undefined,
        hasApplicableMandate: true,
        eligibleScrutins: 20,
        methodSupported: true,
      },
      "COMPUTATION_INCOMPLETE",
    ],
    [
      { chamber: "AN", hasApplicableMandate: false, eligibleScrutins: 20, methodSupported: true },
      "COMPUTATION_INCOMPLETE",
    ],
    [
      { chamber: "AN", hasApplicableMandate: true, eligibleScrutins: 0, methodSupported: true },
      "COMPUTATION_INCOMPLETE",
    ],
    [
      { chamber: "AN", hasApplicableMandate: true, eligibleScrutins: 20, methodSupported: false },
      "COMPUTATION_INCOMPLETE",
    ],
    [
      { chamber: "AN", hasApplicableMandate: true, eligibleScrutins: 20, methodSupported: true },
      "AVAILABLE",
    ],
  ] as const)("résout la matrice %#", (context, expected) => {
    expect(resolveParticipationStatus(context)).toBe(expected);
  });

  const depute = {
    type: "DEPUTE" as const,
    startDate: new Date("2024-07-08"),
    endDate: null,
  };
  const senateur = {
    type: "SENATEUR" as const,
    startDate: new Date("2023-10-02"),
    endDate: null,
  };

  it.each([
    [[depute], undefined, "DEPUTE", "COMPUTATION_INCOMPLETE"],
    [[senateur], undefined, "SENATEUR", "SOURCE_INSUFFICIENT"],
    [[], undefined, null, "COMPUTATION_INCOMPLETE"],
    [[depute, senateur], undefined, null, "COMPUTATION_INCOMPLETE"],
    [[depute, depute], undefined, null, "COMPUTATION_INCOMPLETE"],
    [[senateur, senateur], undefined, null, "COMPUTATION_INCOMPLETE"],
    [[depute, senateur], "DEPUTE", null, "COMPUTATION_INCOMPLETE"],
    [[depute, senateur], "SENATEUR", null, "COMPUTATION_INCOMPLETE"],
    [[senateur], "DEPUTE", null, "COMPUTATION_INCOMPLETE"],
    [[depute], "SENATEUR", null, "COMPUTATION_INCOMPLETE"],
    [[depute, senateur, depute], "DEPUTE", null, "COMPUTATION_INCOMPLETE"],
    [[{ ...depute, startDate: new Date("invalid") }], undefined, null, "COMPUTATION_INCOMPLETE"],
  ] as const)(
    "résout le périmètre courant %# sans masquer les ambiguïtés",
    (mandates, requested, expectedType, expectedStatus) => {
      const result = resolveCurrentParliamentaryMandate([...mandates], requested);

      expect(result.applicableMandate?.type ?? null).toBe(expectedType);
      expect(result.status).toBe(expectedStatus);
    }
  );

  it.each([
    [0, 10, 0],
    [2244, 8434, 27],
    [493, 5380, 9],
    [1762, 8434, 21],
    [1049, 10000, 10],
    [1050, 10000, 11],
    [10, 10, 100],
  ])("arrondit %s / %s au pourcentage entier %s", (expressed, eligible, expected) => {
    expect(roundParticipationRate(expressed, eligible)).toBe(expected);
  });
});
