import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { buildAffairShareCard } from "@/lib/affairs/share-card";
import { AffairShareSheet } from "./AffairShareSheet";

const data = {
  title: "Affaire d'exemple",
  text: "Affaire d'exemple : sources et chronologie sur Poligraph",
  url: "https://poligraph.fr/affaires/affaire-exemple",
};

const affair = {
  involvement: "DIRECT",
  status: "MISE_EN_EXAMEN",
  jurisdictionOrder: "PENAL",
  category: "CORRUPTION",
  title: "Affaire d'exemple",
  sentence: null,
  fullName: "Camille Exemple",
  partyAtTime: "Parti d'exemple",
  sourceCount: 3,
} as const;

function open(card: ReturnType<typeof buildAffairShareCard>) {
  render(<AffairShareSheet slug="affaire-exemple" data={data} card={card} />);
  fireEvent.click(screen.getByRole("button", { name: "Partager cette affaire" }));
}

describe("AffairShareSheet", () => {
  it("says the status, the role and the presumption of innocence in words", () => {
    open(buildAffairShareCard(affair));
    const name =
      screen.getByRole("img", { name: /Image à partager/ }).getAttribute("aria-label") ?? "";
    expect(name).toContain("Procédure en cours, étape : Mise en examen");
    expect(name).toContain("Personne mise en cause : Camille Exemple");
    expect(name).toContain("Parti d'exemple, au moment des faits");
    expect(name).toContain("présomption d'innocence");
  });

  it("offers the link alone for a person the procedure does not target", () => {
    open(buildAffairShareCard({ ...affair, involvement: "MENTIONED_ONLY" }));
    expect(screen.queryByRole("img", { name: /Image à partager/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Copier le lien" })).toBeInTheDocument();
  });

  it("tells the reader the image carries no portrait", () => {
    open(buildAffairShareCard(affair));
    expect(screen.getByText(/ne montre pas de portrait/)).toBeInTheDocument();
  });
});
