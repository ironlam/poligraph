import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeVotesLink } from "@/components/votes/ThemeVotesLink";

describe("ThemeVotesLink", () => {
  it("is a crawlable link to the thematic landing", () => {
    render(<ThemeVotesLink theme="SANTE" />);
    const link = screen.getByRole("link", { name: /Voir tous les votes sur la santé/ });
    expect(link).toHaveAttribute("href", "/parlement/votes/themes/sante");
    expect(link).toHaveClass("inline-flex", "min-h-11", "items-center");
  });

  it("uses a descriptive anchor, not a bare label", () => {
    render(<ThemeVotesLink theme="ECONOMIE_BUDGET" />);
    const link = screen.getByRole("link", {
      name: /Voir tous les votes sur l'économie et le budget/,
    });
    expect(link).toHaveAttribute("href", "/parlement/votes/themes/economie-budget");
  });

  it("lets a long label wrap on a narrow screen instead of overflowing", () => {
    render(<ThemeVotesLink theme="AFFAIRES_ETRANGERES_DEFENSE" />);
    const link = screen.getByRole("link", { name: /Voir tous les votes sur/ });
    expect(link).toHaveClass("whitespace-normal", "max-w-full", "h-auto", "shrink");
    expect(link).not.toHaveClass("whitespace-nowrap");
  });
});
