import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CategoryBadge } from "@/components/legislation/CategoryBadge";

describe("CategoryBadge", () => {
  it("affiche le label du thème quand un thème est fourni", () => {
    render(<CategoryBadge theme="ECONOMIE_BUDGET" />);
    expect(screen.getByText("Économie et budget")).toBeInTheDocument();
  });

  it("donne la priorité au thème sur la catégorie héritée", () => {
    render(<CategoryBadge theme="SANTE" category="Vieille catégorie" />);
    expect(screen.getByText("Santé")).toBeInTheDocument();
    expect(screen.queryByText("Vieille catégorie")).toBeNull();
  });

  it("retombe sur la catégorie quand aucun thème n'est fourni", () => {
    render(<CategoryBadge category="Budget" />);
    expect(screen.getByText("Budget")).toBeInTheDocument();
  });

  it("ne rend rien sans thème ni catégorie", () => {
    const { container } = render(<CategoryBadge />);
    expect(container).toBeEmptyDOMElement();
  });
});
