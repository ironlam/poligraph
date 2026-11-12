import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PoliticianShareSheet } from "./PoliticianShareSheet";

const data = {
  title: "Camille Exemple",
  text: "Camille Exemple, Députée (PEX)",
  url: "https://poligraph.fr/politiques/camille-exemple",
};

const stats = [
  { value: 4, label: "mandats exercés" },
  { value: 0, label: "déclaration HATVP" },
  { value: 2, label: "fact-checks" },
];

function open(votes: { votesFor: number; votesAgainst: number; votesAbstain: number } | null) {
  render(
    <PoliticianShareSheet
      slug="camille-exemple"
      data={data}
      fullName="Camille Exemple"
      mandateLabel="Députée de la 3e circonscription du Rhône"
      partyLabel="Parti d'exemple"
      photoUrl={null}
      votes={votes}
      stats={stats}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Partager cette fiche" }));
  return screen.getByRole("img", { name: /Image à partager/ }).getAttribute("aria-label") ?? "";
}

describe("PoliticianShareSheet", () => {
  it("describes the card: who, mandate, party, votes and what is documented", () => {
    const name = open({ votesFor: 310, votesAgainst: 120, votesAbstain: 15 });
    expect(name).toContain(
      "Camille Exemple, Députée de la 3e circonscription du Rhône, Parti d'exemple"
    );
    expect(name).toContain("310 pour, 120 contre, 15 abstentions");
    expect(name).toContain("4 mandats exercés, 2 fact-checks");
    expect(name).not.toContain("déclaration HATVP");
  });

  it("leaves the vote block out for someone with no recorded vote", () => {
    expect(open(null)).not.toMatch(/votes enregistrés/);
  });

  it("leaves it out as well when every count is zero", () => {
    expect(open({ votesFor: 0, votesAgainst: 0, votesAbstain: 0 })).not.toMatch(
      /votes enregistrés/
    );
  });

  it("never states a judicial count", () => {
    const name = open(null);
    expect(name).not.toMatch(/condamn|mis en examen|affaire/i);
    expect(name).toContain("avec leur statut et leurs sources");
    expect(screen.getByText(/aucun décompte judiciaire/)).toBeInTheDocument();
  });
});
