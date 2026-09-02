import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HubCandidacy } from "@/lib/data/hub";
import { HubPrimaryPaths } from "../HubPrimaryPaths";

function candidacy(over: Partial<HubCandidacy> = {}): HubCandidacy {
  return {
    id: "c1",
    candidateName: "Alix Dupont",
    politicianSlug: "alix-dupont",
    photoUrl: null,
    blobPhotoUrl: null,
    status: "DECLARE",
    sourceUrl: "https://example.org/source",
    sourceLabel: "Le Monde",
    partyLabel: "Parti Test",
    partyColor: null,
    partyShortName: null,
    partyLogoUrl: null,
    measureCount: 0,
    themesCoveredCount: 0,
    programmeAbsence: "aucun_programme",
    ...over,
  };
}

describe("HubPrimaryPaths", () => {
  it("présente les trois parcours structurants au même niveau", () => {
    render(
      <HubPrimaryPaths
        candidacies={[candidacy(), candidacy({ id: "c2", measureCount: 3 })]}
        themeCount={16}
      />
    );

    expect(screen.getByRole("link", { name: /Voir les candidats/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/candidats"
    );
    expect(screen.getByRole("link", { name: /Explorer les thèmes/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/themes"
    );
    expect(screen.getByRole("link", { name: /Comparer deux candidats/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/comparer"
    );
    expect(screen.getByText(/1 a déjà des propositions publiées, sur 2/)).toBeInTheDocument();
    expect(screen.getByText(/16 thèmes/)).toBeInTheDocument();
  });

  it("conserve des compteurs explicites lorsque le corpus est vide", () => {
    render(<HubPrimaryPaths candidacies={[]} themeCount={16} />);

    expect(screen.getByText(/0 ont déjà des propositions publiées, sur 0/)).toBeInTheDocument();
  });
});
