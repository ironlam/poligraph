import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EnrichmentCoveragePanel } from "../EnrichmentCoveragePanel";

describe("EnrichmentCoveragePanel", () => {
  it("présente la couverture et un lien explicite vers les contextes manquants", () => {
    render(
      <EnrichmentCoveragePanel
        coverage={{
          total: 2200,
          withDetails: 98,
          withApprovedSubtopics: 982,
          withQualifications: 0,
          withVoteLinks: 0,
          withSourceLocation: 1277,
          withHistory: 0,
        }}
      />
    );

    expect(
      screen.getByRole("heading", { name: "Couverture des fiches publiques 2027" })
    ).toBeInTheDocument();
    expect(screen.getByText("4 %")).toBeInTheDocument();
    expect(screen.getByText("45 %")).toBeInTheDocument();
    expect(screen.getByText("58 %")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Voir les 2.102 contextes manquants/ })
    ).toHaveAttribute(
      "href",
      "/admin/mesures?corpus=presidentielle-2027&enrichissement=DETAILS_MISSING"
    );
  });

  it("ne propose plus l’action quand tous les contextes sont renseignés", () => {
    render(
      <EnrichmentCoveragePanel
        coverage={{
          total: 2,
          withDetails: 2,
          withApprovedSubtopics: 2,
          withQualifications: 0,
          withVoteLinks: 0,
          withSourceLocation: 2,
          withHistory: 0,
        }}
      />
    );

    expect(screen.queryByRole("link", { name: /contextes manquants/ })).not.toBeInTheDocument();
  });
});
