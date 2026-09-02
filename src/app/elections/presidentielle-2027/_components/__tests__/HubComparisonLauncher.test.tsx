import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HubCandidacy, HubTheme } from "@/lib/data/hub";
import { HubComparisonLauncher } from "../HubComparisonLauncher";

function candidacy(id: string, name: string, measureCount: number): HubCandidacy {
  return {
    id,
    candidateName: name,
    politicianSlug: name.toLocaleLowerCase("fr").replace(" ", "-"),
    photoUrl: null,
    blobPhotoUrl: null,
    status: "DECLARE",
    sourceUrl: "https://example.org/source",
    sourceLabel: "Source",
    partyLabel: null,
    partyColor: null,
    partyShortName: null,
    partyLogoUrl: null,
    measureCount,
    themesCoveredCount: measureCount > 0 ? 1 : 0,
    programmeAbsence: measureCount > 0 ? null : "aucun_programme",
  };
}

const themes: HubTheme[] = [
  { theme: "SANTE", label: "Santé", slug: "sante", publishable: true },
  {
    theme: "LOGEMENT_URBANISME",
    label: "Logement et urbanisme",
    slug: "logement-urbanisme",
    publishable: false,
  },
];

describe("HubComparisonLauncher", () => {
  it("prépare une comparaison avec deux candidats documentés et un thème ouvert", () => {
    render(
      <HubComparisonLauncher
        candidacies={[
          candidacy("c1", "Alice Martin", 3),
          candidacy("c2", "Bruno Zola", 2),
          candidacy("c3", "Camille Durand", 0),
        ]}
        themes={themes}
      />
    );

    const form = screen.getByRole("button", { name: "Comparer" }).closest("form");
    expect(form).toHaveAttribute("action", "/elections/presidentielle-2027/comparer");
    expect(screen.getAllByRole("combobox")).toHaveLength(3);
    expect(screen.getAllByRole("option", { name: "Alice Martin" })).toHaveLength(2);
    expect(screen.queryByRole("option", { name: "Camille Durand" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Santé" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Logement et urbanisme" })).not.toBeInTheDocument();
  });

  it("ne rend pas un formulaire inutilisable sans deux candidats", () => {
    const { container } = render(
      <HubComparisonLauncher candidacies={[candidacy("c1", "Alice Martin", 3)]} themes={themes} />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
