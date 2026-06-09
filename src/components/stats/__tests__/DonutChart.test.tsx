import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DonutChart } from "@/components/stats/DonutChart";

const segments = [
  { label: "Pour", value: 30, color: "#16a34a" },
  { label: "Contre", value: 10, color: "#dc2626" },
];

describe("DonutChart", () => {
  it("rend le graphique avec un rôle image et un aria-label descriptif", () => {
    render(<DonutChart segments={segments} title="Répartition des votes" />);
    const svg = screen.getByRole("img");
    expect(svg).toHaveAttribute("aria-label", "Répartition des votes : Pour 30, Contre 10");
  });

  it("affiche le total au centre", () => {
    render(<DonutChart segments={segments} title="Votes" />);
    expect(screen.getByText("40")).toBeInTheDocument();
  });

  it("expose une table accessible avec les pourcentages", () => {
    render(<DonutChart segments={segments} title="Votes" />);
    expect(screen.getByText("75.0%")).toBeInTheDocument();
    expect(screen.getByText("25.0%")).toBeInTheDocument();
  });

  it("ne rend rien quand le total est nul", () => {
    const { container } = render(<DonutChart segments={[]} title="Vide" />);
    expect(container).toBeEmptyDOMElement();
  });
});
