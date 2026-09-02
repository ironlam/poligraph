import { describe, it, expect } from "vitest";
import { determineStatus, type PoliticianRow } from "../publication-status-rules";

function row(over: Partial<PoliticianRow> = {}): PoliticianRow {
  return {
    id: "p1",
    birthDate: new Date("1970-01-01"),
    deathDate: null,
    photoUrl: null,
    biography: null,
    publicationStatus: "DRAFT",
    statusOverride: false,
    prominenceScore: 15,
    hasCurrentMandate: false,
    hasPublishedDirectAffair: false,
    hasPublishedPresidentialCandidacy: false,
    ...over,
  };
}

describe("determineStatus", () => {
  it("archives a former deputy nobody covers any more", () => {
    expect(determineStatus(row())).toBe("ARCHIVED");
  });

  it("publishes a former deputy whose judicial affair we publish", () => {
    // /politiques and the sitemap only list PUBLISHED profiles. Publishing the
    // affair while leaving the profile out of both would link readers to a page
    // the site itself does not acknowledge.
    expect(determineStatus(row({ hasPublishedDirectAffair: true }))).toBe("PUBLISHED");
  });

  it("keeps a sourced published presidential candidate profile public", () => {
    expect(
      determineStatus(
        row({
          publicationStatus: "PUBLISHED",
          hasPublishedPresidentialCandidacy: true,
        })
      )
    ).toBe("PUBLISHED");
  });

  it("does not publish a draft profile from the candidacy signal alone", () => {
    expect(determineStatus(row({ hasPublishedPresidentialCandidacy: true }))).toBe("ARCHIVED");
  });

  it("keeps publishing anyone holding a current mandate", () => {
    expect(determineStatus(row({ hasCurrentMandate: true }))).toBe("PUBLISHED");
  });

  it("never overrides a manual decision", () => {
    expect(
      determineStatus(row({ statusOverride: true, hasPublishedDirectAffair: true }))
    ).toBeNull();
  });

  it("leaves pre-1958 deceased figures excluded even with an affair", () => {
    // The exclusion rules bound the site's scope; a published affair must not
    // drag a nineteenth-century figure back into the directory.
    expect(
      determineStatus(row({ deathDate: new Date("1935-04-02"), hasPublishedDirectAffair: true }))
    ).toBe("EXCLUDED");
  });

  it("leaves pre-1958 deceased figures excluded even with a presidential candidacy", () => {
    expect(
      determineStatus(
        row({
          deathDate: new Date("1935-04-02"),
          hasPublishedPresidentialCandidacy: true,
        })
      )
    ).toBe("EXCLUDED");
  });

  it("leaves long-deceased figures archived when no affair is published", () => {
    expect(determineStatus(row({ deathDate: new Date("1990-01-01") }))).toBe("ARCHIVED");
  });
});
