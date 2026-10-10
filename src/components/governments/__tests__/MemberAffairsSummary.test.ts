import { describe, expect, it } from "vitest";
import { memberAffairsHref } from "../MemberAffairsSummary";

describe("memberAffairsHref", () => {
  // The affairs card only exists while the profile's affairs tab is active: a bare `#affaires`
  // left the reader on the members list's scroll position, at the footer.
  it("ouvre l'onglet Affaires avant de viser la carte", () => {
    expect(memberAffairsHref("jean-test")).toBe("/politiques/jean-test?tab=affaires#affaires");
  });
});
