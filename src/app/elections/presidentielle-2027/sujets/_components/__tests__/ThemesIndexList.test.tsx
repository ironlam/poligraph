import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ThemesIndexData } from "@/lib/data/themes-index";
import { ThemesIndexList } from "../ThemesIndexList";

function data(over: Partial<ThemesIndexData> = {}): ThemesIndexData {
  return {
    electionSlug: "presidentielle-2027",
    publishableSubjectPageCount: 1,
    themes: [
      {
        theme: "LOGEMENT_URBANISME",
        label: "Logement & Urbanisme",
        slug: "logement-urbanisme",
        documentedMeasureCount: 3,
        currentlyDefendedMeasureCount: 3,
        candidaciesWithVerifiedMeasure: 2,
        publishable: true,
      },
      {
        theme: "NUMERIQUE_TECH",
        label: "Numérique & Tech",
        slug: "numerique-tech",
        documentedMeasureCount: 0,
        currentlyDefendedMeasureCount: 0,
        candidaciesWithVerifiedMeasure: 0,
        publishable: false,
      },
    ],
    ...over,
  };
}

describe("ThemesIndexList", () => {
  it("lie chaque thème à sa page sujet avec son compte de mesures documentées", () => {
    render(<ThemesIndexList data={data()} />);

    const logement = screen.getByRole("link", { name: /Logement & Urbanisme/ });
    expect(logement).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/sujets/logement-urbanisme"
    );
    expect(logement).toHaveTextContent("3 mesures documentées");
  });

  it("garde un thème à zéro mesure dans la liste, pour la navigation", () => {
    render(<ThemesIndexList data={data()} />);

    const numerique = screen.getByRole("link", { name: /Numérique & Tech/ });
    expect(numerique).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/sujets/numerique-tech"
    );
    expect(numerique).toHaveTextContent("Aucune mesure documentée");
  });
});
