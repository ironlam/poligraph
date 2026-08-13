import { describe, expect, it } from "vitest";
import {
  isParticipationPublishable,
  participationStatusFor,
  resolveParticipationStatus,
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
});
