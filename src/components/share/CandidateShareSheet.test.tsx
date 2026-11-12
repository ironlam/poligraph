import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CandidateShareSheet } from "./CandidateShareSheet";

const data = {
  title: "Camille Exemple",
  text: "Camille Exemple, présidentielle 2027",
  url: "https://poligraph.fr/elections/presidentielle-2027/candidats/camille-exemple",
};

function open(stats: { value: number; label: string }[]) {
  render(
    <CandidateShareSheet
      slug="camille-exemple"
      data={data}
      fullName="Camille Exemple"
      partyLabel="Parti d'exemple"
      photoUrl={null}
      round1Date={null}
      stats={stats}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Partager cette fiche" }));
  return screen.getByRole("img", { name: /Image à partager/ }).getAttribute("aria-label") ?? "";
}

describe("CandidateShareSheet", () => {
  it("describes the card in words: who, which election, what is documented", () => {
    const name = open([
      { value: 12, label: "mesures publiées" },
      { value: 3, label: "mandats exercés" },
    ]);
    expect(name).toContain("Camille Exemple, Parti d'exemple");
    expect(name).toContain("présidentielle 2027");
    expect(name).toContain("12 mesures publiées, 3 mandats exercés");
  });

  it("leaves a zero counter off the card", () => {
    const name = open([
      { value: 0, label: "mesure publiée" },
      { value: 2, label: "mandats exercés" },
    ]);
    expect(name).not.toContain("mesure publiée");
    expect(name).toContain("2 mandats exercés");
  });

  it("never states a judicial count nor a candidacy status", () => {
    const name = open([{ value: 2, label: "mandats exercés" }]);
    expect(name).not.toMatch(/condamn|mis en examen|affaire/i);
    expect(name).not.toMatch(/déclarée|annoncée|retirée/i);
    expect(name).toContain("avec leur statut et leurs sources");
  });

  it("tells the reader what the image leaves out", () => {
    open([]);
    expect(screen.getByText(/ni statut de candidature ni décompte judiciaire/)).toBeInTheDocument();
  });
});
