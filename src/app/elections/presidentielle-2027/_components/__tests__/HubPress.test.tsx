import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HubPressArticle } from "@/lib/data/hub-press";
import { HubPress } from "../HubPress";

vi.mock("next/navigation", () => ({ usePathname: () => "/elections/presidentielle-2027" }));

function article(over: Partial<HubPressArticle> = {}): HubPressArticle {
  return {
    id: "a1",
    title: "Le programme logement détaillé",
    url: "https://www.lemonde.fr/politique/article/x",
    outlet: "Le Monde",
    publishedAt: new Date("2027-01-05T00:00:00Z"),
    candidates: [{ name: "Alpha Fixture", slug: "alpha-fixture" }],
    ...over,
  };
}

describe("HubPress", () => {
  it("ne rend rien sans article", () => {
    const { container } = render(<HubPress articles={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("ouvre l'article dans un nouvel onglet et garde le titre du média", () => {
    render(<HubPress articles={[article()]} />);
    const link = screen.getByRole("link", { name: /Le programme logement détaillé, Le Monde/ });
    expect(link).toHaveAttribute("href", "https://www.lemonde.fr/politique/article/x");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("lie chaque candidat cité à sa fiche politique", () => {
    render(<HubPress articles={[article()]} />);
    expect(screen.getByRole("link", { name: "Alpha Fixture" })).toHaveAttribute(
      "href",
      "/politiques/alpha-fixture"
    );
  });

  it("annonce la modération a posteriori et propose de signaler une erreur", () => {
    render(<HubPress articles={[article()]} />);
    expect(screen.getByText(/contrôlés par l.équipe/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Signaler une erreur" })).toHaveAttribute(
      "href",
      "/signaler?from=%2Felections%2Fpresidentielle-2027"
    );
  });
});
