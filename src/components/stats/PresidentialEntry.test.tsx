import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PresidentialEntry } from "./PresidentialEntry";

describe("PresidentialEntry", () => {
  it("relie les statistiques au dossier présidentiel et au comparateur", () => {
    render(
      <PresidentialEntry
        stats={{
          trackedCandidacyCount: 27,
          documentedCandidacyCount: 14,
          verifiedMeasureCount: 1_208,
          comparableThemeCount: 16,
          probityCandidateCount: 3,
        }}
      />
    );

    expect(
      screen.getByRole("heading", { name: "Candidatures et mesures documentées" })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Voir le dossier/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027"
    );
    expect(
      screen.getByRole("link", { name: "Comparer les mesures des candidats" })
    ).toHaveAttribute("href", "/elections/presidentielle-2027/comparer");
    expect(
      screen.getByText((content) => content.replace(/\s/g, "") === "1208")
    ).toBeInTheDocument();
    expect(screen.getByText("mesures publiées")).toBeInTheDocument();
    expect(screen.getByText(/3 personnalités suivies/)).toBeInTheDocument();
  });
});
