import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HubCandidacy } from "@/lib/data/hub";
import { HubCandidacyField } from "../HubCandidacyField";

function candidacy(over: Partial<HubCandidacy> = {}): HubCandidacy {
  return {
    id: "c1",
    candidateName: "Alix Dupont",
    politicianSlug: null,
    status: "PRESSENTI",
    sourceUrl: "https://example.org/source",
    sourceLabel: "Le Monde",
    partyLabel: "Parti Test",
    partyColor: "#ff0000",
    ...over,
  };
}

describe("HubCandidacyField", () => {
  it("rend une carte par candidature avec son statut honnête et le lien vers la fiche", () => {
    const candidacies: HubCandidacy[] = [
      candidacy({
        id: "c1",
        candidateName: "Alix Dupont",
        status: "PRESSENTI",
        politicianSlug: "alix-dupont",
      }),
      candidacy({
        id: "c2",
        candidateName: "Bruno Martin",
        status: "ENVISAGE",
        politicianSlug: null,
      }),
    ];

    render(<HubCandidacyField candidacies={candidacies} />);

    expect(screen.getByText("Alix Dupont")).toBeInTheDocument();
    expect(screen.getByText("Bruno Martin")).toBeInTheDocument();
    expect(screen.getByText("Candidature pressentie")).toBeInTheDocument();
    expect(screen.getByText("Candidature évoquée")).toBeInTheDocument();

    const link = screen.getByRole("link", { name: "Alix Dupont" });
    expect(link).toHaveAttribute("href", "/politiques/alix-dupont");
  });

  it("annonce l'ordre alphabétique du champ", () => {
    render(<HubCandidacyField candidacies={[candidacy()]} />);
    expect(screen.getByText(/ordre alphabétique/)).toBeInTheDocument();
  });
});
