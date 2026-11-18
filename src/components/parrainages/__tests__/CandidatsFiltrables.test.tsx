import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CandidatsFiltrables } from "../CandidatsFiltrables";

const NOMS = [
  "PÉCRESSE Valérie",
  "MACRON Emmanuel",
  "HIDALGO Anne",
  "MÉLENCHON Jean-Luc",
  "ZEMMOUR Éric",
  "JADOT Yannick",
  "LASSALLE Jean",
  "ROUSSEL Fabien",
  "LE PEN Marine",
  "DUPONT-AIGNAN Nicolas",
  "POUTOU Philippe",
  "ARTHAUD Nathalie",
];
const candidats = NOMS.map((nom) => ({ cle: nom, nom, ligne: <a href={`/${nom}`}>{nom}</a> }));
const visibles = (container: HTMLElement) =>
  [...container.querySelectorAll("li:not([hidden])")].map((li) => li.textContent);
const setup = () => {
  const view = render(<CandidatsFiltrables candidats={candidats} />);
  return { ...view, input: screen.getByLabelText("Filtrer par nom") };
};

describe("CandidatsFiltrables", () => {
  it("montre les dix premiers et garde tous les autres dans le HTML, dans l'ordre reçu", () => {
    const { container } = setup();
    expect(visibles(container)).toEqual(NOMS.slice(0, 10));
    expect([...container.querySelectorAll("li")].map((li) => li.textContent)).toEqual(NOMS);
    expect(container.querySelectorAll("li[hidden] a")).toHaveLength(2);
    expect(screen.getByText("10 sur 12 candidats affichés")).toBeTruthy();
  });

  it("filtre par nom sans tenir compte des accents ni de la casse, au-delà des dix premiers", () => {
    const { container, input } = setup();
    fireEvent.change(input, { target: { value: "melen" } });
    expect(visibles(container)).toEqual(["MÉLENCHON Jean-Luc"]);
    fireEvent.change(input, { target: { value: " Poutou " } });
    expect(visibles(container)).toEqual(["POUTOU Philippe"]);
    fireEvent.change(input, { target: { value: "an" } });
    expect(visibles(container)).toEqual([
      "MACRON Emmanuel",
      "HIDALGO Anne",
      "MÉLENCHON Jean-Luc",
      "JADOT Yannick",
      "LASSALLE Jean",
      "DUPONT-AIGNAN Nicolas",
    ]);
  });

  it("dit qu'aucun nom ne correspond, puis revient aux dix premiers", () => {
    const { container, input } = setup();
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(visibles(container)).toEqual([]);
    expect(
      screen.getByText("Aucun candidat de la liste ne correspond à cette recherche.")
    ).toBeTruthy();
    fireEvent.change(input, { target: { value: "" } });
    expect(visibles(container)).toHaveLength(10);
  });

  it("affiche toute la liste à la demande, puis la replie", () => {
    const { container } = setup();
    const button = screen.getByRole("button", { name: "Afficher les 12 candidats" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    expect(visibles(container)).toEqual(NOMS);
    fireEvent.click(screen.getByRole("button", { name: "Afficher les 10 premiers" }));
    expect(visibles(container)).toHaveLength(10);
  });

  it("ne propose pas le bouton quand la liste tient déjà", () => {
    render(<CandidatsFiltrables candidats={candidats.slice(0, 3)} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
