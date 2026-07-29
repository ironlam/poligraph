import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AffairHubTiles } from "../AffairHubTiles";

describe("AffairHubTiles", () => {
  it("rend les 3 tuiles d'entrée vers les bonnes destinations", () => {
    render(<AffairHubTiles etabliCount={42} />);
    expect(screen.getByRole("link", { name: /Condamnations définitives/i })).toHaveAttribute(
      "href",
      "/affaires/condamnations"
    );
    expect(screen.getByRole("link", { name: /par parti/i })).toHaveAttribute(
      "href",
      "/statistiques"
    );
    expect(screen.getByRole("link", { name: /Violences contre les élus/i })).toHaveAttribute(
      "href",
      "/affaires?mode=victime"
    );
    expect(screen.getByText(/42/)).toBeInTheDocument();
  });
});
