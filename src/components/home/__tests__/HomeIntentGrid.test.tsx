import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HomeIntentGrid } from "@/components/home/HomeIntentGrid";

describe("HomeIntentGrid", () => {
  it("ouvre la grille par la comparaison des candidats à la présidentielle", () => {
    render(<HomeIntentGrid enabledFlags={new Set<string>()} />);

    expect(screen.getAllByRole("link")[0]).toHaveAccessibleName(
      /comparer les candidats à la présidentielle 2027/i
    );

    const link = screen.getByRole("link", {
      name: /comparer les candidats à la présidentielle 2027/i,
    });
    expect(link).toHaveAttribute("href", "/elections/presidentielle-2027");
  });

  it("ne propose plus de suivre les municipales, qui sont passées", () => {
    render(<HomeIntentGrid enabledFlags={new Set(["MUNICIPALES_2026"])} />);

    expect(screen.queryByText(/suivre les municipales/i)).not.toBeInTheDocument();
  });

  it("garde les cartes élu, vote et partis, et le comportement du drapeau de comparaison", () => {
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

  it("mène à la commune et au député, en cartes à part", () => {
    render(<HomeIntentGrid enabledFlags={new Set<string>()} />);

    expect(screen.getByRole("link", { name: /la politique de ma ville/i })).toHaveAttribute(
      "href",
      "/territoires"
    );
    expect(screen.getByRole("link", { name: /trouver mon député/i })).toHaveAttribute(
      "href",
      "/mon-depute"
    );
    expect(screen.getAllByRole("link")).toHaveLength(6);
  });

  it("porte le compte à rebours sur la carte présidentielle, et seulement avant le premier tour", () => {
    const { rerender } = render(
      <HomeIntentGrid enabledFlags={new Set<string>()} daysToPresidentialRound1={150} />
    );
    expect(
      screen.getByRole("link", { name: /comparer les candidats à la présidentielle 2027/i })
    ).toHaveTextContent("J-150");

    rerender(<HomeIntentGrid enabledFlags={new Set<string>()} daysToPresidentialRound1={0} />);
    expect(screen.queryByText(/^J-/)).not.toBeInTheDocument();

    rerender(<HomeIntentGrid enabledFlags={new Set<string>()} />);
    expect(screen.queryByText(/^J-/)).not.toBeInTheDocument();
  });
});
