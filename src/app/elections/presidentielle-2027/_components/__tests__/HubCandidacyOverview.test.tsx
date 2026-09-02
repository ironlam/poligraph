import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HubCandidacy } from "@/lib/data/hub";
import { HubCandidacyOverview } from "../HubCandidacyOverview";

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

const field = [
  candidacy(),
  candidacy({ id: "c2", status: "DECLARE", measureCount: 3, themesCoveredCount: 2 }),
  candidacy({ id: "c3", status: "PRESSENTI" }),
  candidacy({ id: "c4", status: "ENVISAGE" }),
];

describe("HubCandidacyOverview", () => {
  it("montre seulement les personnes ayant des propositions dans un aperçu compact", () => {
    render(<HubCandidacyOverview candidacies={field} />);

    expect(screen.getAllByRole("link", { name: /Alix Dupont/ })).toHaveLength(1);
    expect(screen.getByText(/1 personne a des propositions publiées/)).toBeInTheDocument();
    expect(
      screen.getByRole("region", {
        name: "Candidats et candidates avec des propositions publiées",
      })
    ).toHaveClass("overflow-x-auto");
  });

  it("mène au champ complet, avec son effectif dans le libellé du lien", () => {
    render(<HubCandidacyOverview candidacies={field} />);

    expect(screen.getByRole("link", { name: /Voir les 4 candidatures/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/candidats"
    );
  });

  it("qualifie les propositions publiées sans inventer de thème", () => {
    render(
      <HubCandidacyOverview
        candidacies={[candidacy({ id: "c2", measureCount: 1, programmeAbsence: null })]}
      />
    );

    expect(screen.getByText("1 mesure · 0 thèmes")).toBeInTheDocument();
  });

  it("reste lisible sur un champ vide, sans compteurs à zéro", () => {
    render(<HubCandidacyOverview candidacies={[]} />);

    expect(screen.getByText("Aucune proposition publiée à ce jour.")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });
});
