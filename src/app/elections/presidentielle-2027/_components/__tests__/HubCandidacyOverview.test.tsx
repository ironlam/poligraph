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
  it("compte chaque statut comme les filtres de la liste, pressenties et envisagées ensemble", () => {
    render(<HubCandidacyOverview candidacies={field} />);

    expect(screen.getByRole("link", { name: /2 Candidatures annoncées/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/candidats?statut=annoncees"
    );
    expect(screen.getByRole("link", { name: /2 Personnalités pressenties/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/candidats?statut=pressenties"
    );
  });

  it("ouvre la liste sur les personnes ayant des propositions publiées", () => {
    render(<HubCandidacyOverview candidacies={field} />);

    expect(screen.getByRole("link", { name: /1 Avec des propositions publiées/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/candidats?propositions=publiees"
    );
  });

  it("ne lie pas un filtre vide, qui n'aurait rien à montrer", () => {
    render(<HubCandidacyOverview candidacies={field} />);

    // Aucune candidature retirée dans ce champ : le compteur reste du texte.
    expect(screen.getByText("Candidatures retirées")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Candidatures retirées/ })).not.toBeInTheDocument();
  });

  it("mène au champ complet, avec son effectif dans le libellé du lien", () => {
    render(<HubCandidacyOverview candidacies={field} />);

    expect(screen.getByRole("link", { name: /Voir les 4 personnes suivies/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/candidats"
    );
  });

  it("reste lisible sur un champ vide, sans compteurs à zéro", () => {
    render(<HubCandidacyOverview candidacies={[]} />);

    expect(screen.getByText("Aucune candidature sourcée à ce jour.")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });
});
