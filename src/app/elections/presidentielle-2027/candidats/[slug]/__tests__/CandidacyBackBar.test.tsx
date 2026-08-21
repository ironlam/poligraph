import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CandidacyBackBar } from "../_components/CandidacyBackBar";

describe("CandidacyBackBar", () => {
  it("offre une sortie nommée vers le champ, collée sous l'en-tête du site", () => {
    const { container } = render(<CandidacyBackBar electionSlug="presidentielle-2027" />);

    // La liste des candidatures, pas le hub : la barre s'appelle « Toutes les candidatures »,
    // et depuis que le champ a quitté la page d'accueil du hub, une seule page porte ce nom.
    const lien = screen.getByRole("link", { name: "Toutes les candidatures" });
    expect(lien).toHaveAttribute("href", "/elections/presidentielle-2027/candidats");

    // `top-16`, la hauteur exacte du `<header>` global : sans cet offset la barre se glisse
    // sous l'en-tête au défilement au lieu de se poser dessous.
    const barre = container.firstElementChild as HTMLElement;
    expect(barre.className).toContain("sticky");
    expect(barre.className).toContain("top-16");
  });

  it("ne redouble pas le logo de l'en-tête, et ne nomme la destination qu'une fois", () => {
    // La maquette dessine un logo Poligraph dans cette barre : c'est l'en-tête du site, que le
    // layout rend déjà en `sticky top-0`. Le reproduire empilerait deux barres et deux logos.
    render(<CandidacyBackBar electionSlug="presidentielle-2027" />);

    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("garde une cible tactile de 44 px sur mobile", () => {
    render(<CandidacyBackBar electionSlug="presidentielle-2027" />);
    const lien = screen.getByRole("link", { name: "Toutes les candidatures" });
    expect(lien.className).toContain("min-h-11");
  });
});
