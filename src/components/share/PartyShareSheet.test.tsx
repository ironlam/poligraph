import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PartyShareSheet } from "./PartyShareSheet";

const data = {
  title: "Parti d'exemple (PEX)",
  text: "Parti d'exemple : élus, votes et programme",
  url: "https://poligraph.fr/partis/parti-exemple",
};

function open(leader: { fullName: string; role: string; photoUrl: null } | null) {
  render(
    <PartyShareSheet
      slug="parti-exemple"
      data={data}
      name="Parti d'exemple"
      subline="PEX · Fondé en 2016"
      color="#336699"
      leader={leader}
      stats={[
        { value: 42, label: "députés" },
        { value: 0, label: "sénateur" },
        { value: 5, label: "députés européens" },
      ]}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Partager cette fiche" }));
  return screen.getByRole("img", { name: /Image à partager/ }).getAttribute("aria-label") ?? "";
}

describe("PartyShareSheet", () => {
  it("describes the card: party, leader and seats, zeros left out", () => {
    const name = open({
      fullName: "Camille Exemple",
      role: "Présidente depuis 2022",
      photoUrl: null,
    });
    expect(name).toContain("Parti d'exemple, PEX · Fondé en 2016");
    expect(name).toContain("Présidente depuis 2022 : Camille Exemple");
    expect(name).toContain("42 députés, 5 députés européens");
    expect(name).not.toContain("sénateur");
  });

  it("draws a party without a known leader all the same", () => {
    const name = open(null);
    expect(name).toContain("42 députés");
  });

  it("never states a judicial count", () => {
    const name = open(null);
    expect(name).not.toMatch(/condamn|affaire|mis en examen/i);
    expect(screen.getByText(/aucun décompte judiciaire/)).toBeInTheDocument();
  });
});
