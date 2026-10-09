import { describe, expect, it } from "vitest";
import { PublicationStatus } from "@/generated/prisma";
import { determineStatus, type PoliticianRow } from "../publication-status-rules";

function row(over: Partial<PoliticianRow> = {}): PoliticianRow {
  return {
    id: "p1",
    birthDate: new Date("1970-01-01T00:00:00Z"),
    deathDate: null,
    photoUrl: null,
    biography: null,
    publicationStatus: PublicationStatus.DRAFT,
    statusOverride: false,
    prominenceScore: 0,
    hasCurrentMandate: false,
    hasPublishedDirectAffair: false,
    hasPublishedPresidentialCandidacy: false,
    hasVerifiedGovernmentFunction: false,
    ...over,
  };
}

describe("règle 3d : fonction gouvernementale vérifiée", () => {
  it("publie une fonction prouvée par un acte avec une photo, quel que soit le gouvernement", () => {
    // Un score nul et aucun mandat en cours : seule la règle 3d peut publier.
    expect(
      determineStatus(row({ hasVerifiedGovernmentFunction: true, photoUrl: "https://x/p.jpg" }))
    ).toBe(PublicationStatus.PUBLISHED);
  });

  it("publie aussi avec une biographie seule", () => {
    expect(
      determineStatus(row({ hasVerifiedGovernmentFunction: true, biography: "Biographie." }))
    ).toBe(PublicationStatus.PUBLISHED);
  });

  it("ne s'applique pas à une fonction seulement issue du jeu de données", () => {
    expect(
      determineStatus(row({ hasVerifiedGovernmentFunction: false, photoUrl: "https://x/p.jpg" }))
    ).toBe(PublicationStatus.ARCHIVED);
  });

  it("ne s'applique pas sans photo ni biographie", () => {
    expect(determineStatus(row({ hasVerifiedGovernmentFunction: true }))).not.toBe(
      PublicationStatus.PUBLISHED
    );
  });

  it("laisse la main à statusOverride", () => {
    expect(
      determineStatus(
        row({
          hasVerifiedGovernmentFunction: true,
          photoUrl: "https://x/p.jpg",
          statusOverride: true,
        })
      )
    ).toBeNull();
  });

  it("est derrière l'exclusion des décès avant 1958", () => {
    expect(
      determineStatus(
        row({
          hasVerifiedGovernmentFunction: true,
          photoUrl: "https://x/p.jpg",
          deathDate: new Date("1950-01-01T00:00:00Z"),
        })
      )
    ).toBe(PublicationStatus.EXCLUDED);
  });
});
