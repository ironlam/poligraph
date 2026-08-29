import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SubjectPageData } from "@/lib/data/subject-page";
import { SubjectSidebar } from "../SubjectSidebar";

const THEMES: SubjectPageData["siblingThemes"] = [
  {
    theme: "LOGEMENT_URBANISME",
    label: "Logement & Urbanisme",
    slug: "logement-urbanisme",
    measureCount: 10,
    publishable: true,
  },
  { theme: "SANTE", label: "Santé", slug: "sante", measureCount: 1, publishable: false },
  {
    theme: "INSTITUTIONS",
    label: "Institutions",
    slug: "institutions",
    measureCount: 0,
    publishable: false,
  },
];

/**
 * The list renders twice: a disclosure below `lg`, the rail at `lg` and above. jsdom applies no
 * breakpoint, so both are in the DOM and every assertion counts occurrences — which also catches a
 * layout that quietly stops rendering one of the two.
 */
describe("SubjectSidebar", () => {
  it("rend les deux mises en page, repli et rail", () => {
    const { container } = render(<SubjectSidebar themes={THEMES} current="LOGEMENT_URBANISME" />);
    expect(container.querySelector("details")).not.toBeNull();
    expect(screen.getByRole("navigation", { name: "Les thématiques" })).toBeInTheDocument();
  });

  it("marque le thème courant pour les lecteurs d'écran, pas seulement par la couleur", () => {
    render(<SubjectSidebar themes={THEMES} current="SANTE" />);
    const courants = screen.getAllByRole("link", { current: "page" });
    expect(courants).toHaveLength(2);
    for (const lien of courants) expect(lien).toHaveTextContent("Santé");
  });

  it("garde un thème sans aucune mesure dans la liste", () => {
    // Le vide est une information : masquer le sujet ferait paraître le corpus plus complet.
    render(<SubjectSidebar themes={THEMES} current="LOGEMENT_URBANISME" />);
    expect(screen.getAllByRole("link", { name: /Institutions/ })).toHaveLength(2);
  });

  it("donne l'unité du compteur à la voix, sans la répéter à l'écran", () => {
    render(<SubjectSidebar themes={THEMES} current="LOGEMENT_URBANISME" />);
    const lien = screen.getAllByRole("link", { name: /Logement & Urbanisme/ })[0]!;
    // Le nombre nu est masqué aux lecteurs d'écran, la forme accordée leur est réservée.
    expect(within(lien).getByText("10")).toHaveAttribute("aria-hidden", "true");
    expect(lien).toHaveAccessibleName(expect.stringContaining("10 mesures"));
  });

  it("accorde le compteur au singulier", () => {
    render(<SubjectSidebar themes={THEMES} current="LOGEMENT_URBANISME" />);
    const lien = screen.getAllByRole("link", { name: /Santé/ })[0]!;
    expect(lien).toHaveAccessibleName(expect.stringContaining("1 mesure"));
    expect(lien).not.toHaveAccessibleName(expect.stringContaining("1 mesures"));
  });

  it("pointe chaque thème vers sa page", () => {
    render(<SubjectSidebar themes={THEMES} current="LOGEMENT_URBANISME" />);
    expect(screen.getAllByRole("link", { name: /Santé/ })[0]).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/themes/sante"
    );
  });
});
