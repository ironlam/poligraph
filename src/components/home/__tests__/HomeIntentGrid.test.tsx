import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HomeIntentGrid } from "@/components/home/HomeIntentGrid";

describe("HomeIntentGrid", () => {
  it("propose de comparer les candidats à 2027 en quatrième carte", () => {
    render(<HomeIntentGrid enabledFlags={new Set<string>()} />);

    const link = screen.getByRole("link", { name: /comparer les candidats à 2027/i });
    expect(link).toHaveAttribute("href", "/elections/presidentielle-2027");
  });

  it("ne propose plus de suivre les municipales, qui sont passées", () => {
    render(<HomeIntentGrid enabledFlags={new Set(["MUNICIPALES_2026"])} />);

    expect(screen.queryByText(/suivre les municipales/i)).not.toBeInTheDocument();
  });

  it("garde les trois autres cartes et le comportement du drapeau de comparaison", () => {
    render(<HomeIntentGrid enabledFlags={new Set(["COMPARISON_TOOL"])} />);

    expect(screen.getByRole("link", { name: /vérifier un élu/i })).toHaveAttribute(
      "href",
      "/politiques"
    );
    expect(screen.getByRole("link", { name: /comprendre un vote/i })).toHaveAttribute(
      "href",
      "/parlement/votes"
    );
    expect(screen.getByRole("link", { name: /comparer les partis/i })).toHaveAttribute(
      "href",
      "/comparer"
    );
  });
});
