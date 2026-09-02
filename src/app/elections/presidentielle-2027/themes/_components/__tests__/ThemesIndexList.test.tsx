import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ThemesIndexData } from "@/lib/data/themes-index";
import { ThemesIndexList } from "../ThemesIndexList";

function data(over: Partial<ThemesIndexData> = {}): ThemesIndexData {
  return {
    electionSlug: "presidentielle-2027",
    publishableSubjectPageCount: 1,
    featuredSubtopics: [],
    themes: [
      {
        theme: "LOGEMENT_URBANISME",
        label: "Logement & Urbanisme",
        slug: "logement-urbanisme",
        documentedMeasureCount: 3,
        currentlyDefendedMeasureCount: 3,
        documentedCandidacyCount: 2,
        candidaciesWithVerifiedMeasure: 2,
        lastReviewedAt: new Date("2026-08-21"),
        publishable: true,
      },
      {
        theme: "NUMERIQUE_TECH",
        label: "Numérique & Tech",
        slug: "numerique-tech",
        documentedMeasureCount: 0,
        currentlyDefendedMeasureCount: 0,
        documentedCandidacyCount: 0,
        candidaciesWithVerifiedMeasure: 0,
        lastReviewedAt: null,
        publishable: false,
      },
    ],
    ...over,
  };
}

describe("ThemesIndexList", () => {
  it("lie chaque thème à sa page et affiche les quatre indicateurs de couverture", () => {
    render(<ThemesIndexList data={data()} />);

    const logements = screen.getAllByRole("link", { name: /Logement & Urbanisme/ });
    expect(logements).toHaveLength(2);
    for (const logement of logements) {
      expect(logement).toHaveAttribute(
        "href",
        "/elections/presidentielle-2027/themes/logement-urbanisme"
      );
    }
    expect(screen.getAllByText("Candidats avec des mesures").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Mesures publiées").length).toBeGreaterThan(0);
    expect(screen.queryByText("Mesures retirées")).not.toBeInTheDocument();
    expect(screen.getAllByText(/21 août 2026/).length).toBeGreaterThan(0);
  });

  it("n'ajoute le compteur des mesures retirées que lorsqu'il est utile", () => {
    const withWithdrawal = data();
    withWithdrawal.themes[0] = {
      ...withWithdrawal.themes[0]!,
      documentedMeasureCount: 4,
      currentlyDefendedMeasureCount: 3,
    };
    render(<ThemesIndexList data={withWithdrawal} />);

    expect(screen.getAllByText("Mesures retirées").length).toBeGreaterThan(0);
  });

  it("garde un thème à zéro mesure dans la liste, pour la navigation", () => {
    render(<ThemesIndexList data={data()} />);

    const numeriques = screen.getAllByRole("link", { name: /Numérique & Tech/ });
    expect(numeriques).toHaveLength(2);
    for (const numerique of numeriques) {
      expect(numerique).toHaveAttribute(
        "href",
        "/elections/presidentielle-2027/themes/numerique-tech"
      );
    }
    expect(screen.getAllByText("Aucune revue publiée").length).toBeGreaterThan(0);
  });
});
