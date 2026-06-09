import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProportionBar } from "@/components/stats/ProportionBar";

describe("ProportionBar", () => {
  it("rend les segments avec un aria-label de répartition", () => {
    render(<ProportionBar breakdown={{ vrai: 5, trompeur: 0, faux: 5, inverifiable: 0 }} />);
    const bar = screen.getByRole("img");
    expect(bar.getAttribute("aria-label")).toContain("Vrai: 50%");
    expect(bar.getAttribute("aria-label")).toContain("Faux: 50%");
  });

  it("omet les segments à valeur nulle de la table accessible", () => {
    render(<ProportionBar breakdown={{ vrai: 10, trompeur: 0, faux: 0, inverifiable: 0 }} />);
    expect(screen.getByText("Vrai")).toBeInTheDocument();
    expect(screen.queryByText("Trompeur")).toBeNull();
  });

  it("ne rend rien quand tout est à zéro", () => {
    const { container } = render(
      <ProportionBar breakdown={{ vrai: 0, trompeur: 0, faux: 0, inverifiable: 0 }} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
