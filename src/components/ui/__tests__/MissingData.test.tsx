import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MissingData } from "../MissingData";

describe("MissingData", () => {
  it("énonce l'absence et sa raison", () => {
    render(
      <MissingData title="Aucune déclaration publiée">
        La HATVP n{"'"}a pas publié de déclaration pour ce mandat.
      </MissingData>
    );
    expect(screen.getByText("Aucune déclaration publiée")).toBeInTheDocument();
    expect(screen.getByText(/La HATVP/)).toBeInTheDocument();
  });

  it("fonctionne sans titre, quand le corps porte le message", () => {
    render(<MissingData>Les candidatures ne sont pas publiées en open data.</MissingData>);
    expect(screen.getByText(/open data/)).toBeInTheDocument();
  });

  // Le squelette dit « ça arrive », pas « ça n'existe pas » : il ne doit pas servir ici.
  it("n'est pas un squelette de chargement", () => {
    const { container } = render(<MissingData>Donnée inconnue.</MissingData>);
    expect(container.querySelector("[class*='animate-pulse']")).toBeNull();
  });

  it("borde en pointillé depuis un jeton, sans couleur codée en dur", () => {
    const { container } = render(<MissingData>Donnée inconnue.</MissingData>);
    const box = container.firstElementChild!;
    expect(box.className).toContain("border-dashed");
    expect(box.className).toContain("border-muted-foreground/30");
  });

  it("masque le glyphe aux lecteurs d'écran", () => {
    render(
      <MissingData title="Collecte en cours" glyph="◦">
        Rien à afficher pour le moment.
      </MissingData>
    );
    const glyph = screen.getByText("◦");
    expect(glyph).toHaveAttribute("aria-hidden", "true");
  });

  it("n'introduit ni tiret ni zéro de remplissage", () => {
    const { container } = render(<MissingData>Nombre de délégués inconnu.</MissingData>);
    expect(container.textContent).not.toMatch(/—|N\/A/);
  });
});
