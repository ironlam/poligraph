import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PoliticianCard } from "./PoliticianCard";

const mockPolitician = {
  id: "1",
  slug: "jean-dupont",
  publicId: null,
  civility: "M." as const,
  firstName: "Jean",
  lastName: "Dupont",
  fullName: "Jean Dupont",
  birthDate: new Date("1970-01-15"),
  deathDate: null,
  birthPlace: "Paris",
  photoUrl: null,
  photoSource: null,
  blobPhotoUrl: null,
  officialId: null,
  biography: null,
  biographyGeneratedAt: null,
  publicationStatus: "PUBLISHED" as const,
  statusOverride: false,
  source: "MANUAL" as const,
  prominenceScore: 0,
  normalizedLastName: null,
  phoneticCode: null,
  contactEmail: null,
  contactTwitter: null,
  contactFacebook: null,
  contactWebsite: null,
  contactOverride: false,
  currentPartyId: "party-1",
  createdAt: new Date(),
  updatedAt: new Date(),
  currentParty: {
    id: "party-1",
    slug: "lr",
    publicId: null,
    name: "Les Républicains",
    shortName: "LR",
    description: null,
    color: "#0066CC",
    logoUrl: null,
    foundedDate: null,
    dissolvedDate: null,
    politicalPosition: null,
    politicalPositionSource: null,
    politicalPositionSourceUrl: null,
    politicalPositionOverride: false,
    ideology: null,
    headquarters: null,
    website: null,
    predecessorId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

describe("PoliticianCard", () => {
  it("should render politician name", () => {
    render(<PoliticianCard politician={mockPolitician} />);
    expect(screen.getByText("Jean Dupont")).toBeInTheDocument();
  });

  it("should render party badge", () => {
    render(<PoliticianCard politician={mockPolitician} />);
    expect(screen.getByText("LR")).toBeInTheDocument();
  });

  it("should link to politician page", () => {
    render(<PoliticianCard politician={mockPolitician} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/politiques/jean-dupont");
  });

  it("should show deceased badge when politician is deceased", () => {
    const deceasedPolitician = {
      ...mockPolitician,
      deathDate: new Date("2020-01-01"),
    };
    render(<PoliticianCard politician={deceasedPolitician} />);
    expect(screen.getByText("Décédé")).toBeInTheDocument();
  });

  it("should show Décédée for female politicians", () => {
    const deceasedFemale = {
      ...mockPolitician,
      civility: "Mme" as const,
      deathDate: new Date("2020-01-01"),
    };
    render(<PoliticianCard politician={deceasedFemale} />);
    expect(screen.getByText("Décédée")).toBeInTheDocument();
  });

  it("should show conviction indicator when enabled and has critique affair", () => {
    const politicianWithCritique = {
      ...mockPolitician,
      hasCritiqueAffair: true,
      _count: { affairs: 2 },
    };
    render(<PoliticianCard politician={politicianWithCritique} showConvictionBadge />);
    expect(screen.getByText("Probité : 2 condamnations")).toBeInTheDocument();
  });

  it("should not show conviction indicator when disabled", () => {
    const politicianWithCritique = {
      ...mockPolitician,
      hasCritiqueAffair: true,
      _count: { affairs: 2 },
    };
    render(<PoliticianCard politician={politicianWithCritique} showConvictionBadge={false} />);
    expect(screen.queryByText("Probité : 2 condamnations")).not.toBeInTheDocument();
  });

  it("should render without party", () => {
    const independentPolitician = {
      ...mockPolitician,
      currentParty: null,
      currentPartyId: null,
    };
    render(<PoliticianCard politician={independentPolitician} />);
    expect(screen.getByText("Jean Dupont")).toBeInTheDocument();
    expect(screen.queryByText("LR")).not.toBeInTheDocument();
  });

  it("should show current mandate when available", () => {
    const politicianWithMandate = {
      ...mockPolitician,
      currentMandate: {
        type: "DEPUTE" as const,
        title: "Député du Rhône",
        constituency: "Rhône (3ème)",
      },
    };
    render(<PoliticianCard politician={politicianWithMandate} />);
    expect(screen.getByText(/Député/)).toBeInTheDocument();
  });

  it("should show missing declaration badge when enabled", () => {
    const parliamentarian = {
      ...mockPolitician,
      missingDeclaration: true,
    };
    render(<PoliticianCard politician={parliamentarian} showMissingDeclarationBadge />);
    expect(screen.getByText("Aucune déclaration publiée")).toBeInTheDocument();
  });

  it("should not show missing declaration badge when disabled", () => {
    const parliamentarian = {
      ...mockPolitician,
      missingDeclaration: true,
    };
    render(<PoliticianCard politician={parliamentarian} />);
    expect(screen.queryByText("Aucune déclaration publiée")).not.toBeInTheDocument();
  });
});
