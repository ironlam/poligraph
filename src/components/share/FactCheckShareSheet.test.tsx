import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FactCheckShareSheet } from "./FactCheckShareSheet";

const data = {
  title: "Une affirmation d'exemple vérifiée",
  text: "Une affirmation d'exemple vérifiée - Verdict : Faux",
  url: "https://poligraph.fr/factchecks/affirmation-exemple",
};

function open(claimant: string | null) {
  render(
    <FactCheckShareSheet
      slug="affirmation-exemple"
      data={data}
      card={{
        claimText: "Le budget d'exemple a doublé en un an",
        claimant,
        verdictLabel: "Faux",
        source: "Média d'exemple",
        publishedLabel: "3 mars 2026",
      }}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Partager ce fact-check" }));
  return screen.getByRole("img", { name: /Image à partager/ }).getAttribute("aria-label") ?? "";
}

describe("FactCheckShareSheet", () => {
  it("attributes the verdict to the outlet that reached it, in words", () => {
    const name = open("Camille Exemple");
    expect(name).toContain("Déclaration vérifiée de Camille Exemple");
    expect(name).toContain("« Le budget d'exemple a doublé en un an »");
    expect(name).toContain("Verdict de Média d'exemple, publié le 3 mars 2026 : Faux");
  });

  it("works for a statement with no named author", () => {
    expect(open(null)).toContain("Déclaration vérifiée : «");
  });

  it("says the verification is not Poligraph's own", () => {
    open(null);
    expect(screen.getByText(/ne produit pas ses propres vérifications/)).toBeInTheDocument();
  });
});
