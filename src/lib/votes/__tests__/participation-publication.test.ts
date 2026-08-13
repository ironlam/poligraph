import { describe, expect, it } from "vitest";
import {
  isParticipationPublishable,
  participationStatusFor,
} from "@/lib/votes/participation-publication";

describe("politique de publication de la participation", () => {
  it("exige une politique explicite par chambre", () => {
    expect(isParticipationPublishable("AN")).toBe(true);
    expect(isParticipationPublishable("SENAT")).toBe(false);
    expect(participationStatusFor("SENAT")).toBe("SOURCE_INSUFFICIENT");
  });
});
