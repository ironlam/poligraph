import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HorizontalBars } from "@/components/stats/HorizontalBars";

const bars = [
  { label: "Macron", value: 120 },
  { label: "Le Pen", value: 80 },
];

describe("HorizontalBars", () => {
  it("rend le conteneur avec un rôle image et le titre en aria-label", () => {
    render(<HorizontalBars bars={bars} title="Présence" />);
    expect(screen.getByRole("img", { name: "Présence" })).toBeInTheDocument();
  });

  it("affiche les labels et valeurs de chaque barre", () => {
    render(<HorizontalBars bars={bars} title="Présence" />);
    // Chaque label/valeur apparaît dans la barre visible ET dans la table sr-only
    expect(screen.getAllByText("Macron").length).toBeGreaterThan(0);
    expect(screen.getAllByText("120").length).toBeGreaterThan(0);
  });

  it("formate les valeurs décimales à une décimale", () => {
    render(<HorizontalBars bars={[{ label: "Taux", value: 12.34 }]} title="Taux" />);
    expect(screen.getByText("12.3")).toBeInTheDocument();
  });

  it("rend un lien quand href est fourni", () => {
    render(<HorizontalBars bars={[{ label: "Macron", value: 1, href: "/m" }]} title="X" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/m");
  });

  it("ajoute le suffixe aux valeurs", () => {
    render(<HorizontalBars bars={[{ label: "Présence", value: 90, suffix: "%" }]} title="X" />);
    // Présent dans la barre visible et dans la table accessible
    expect(screen.getAllByText("90%").length).toBeGreaterThan(0);
  });
});
