import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PUBLICATION_GATES } from "@/config/publication-gates";
import { HubClosedState } from "../HubClosedState";

describe("HubClosedState", () => {
  it("nomme l'état sans répéter le lien de couverture placé dans l'état du corpus", () => {
    render(<HubClosedState verifiedMeasureCount={0} themeCount={13} />);

    expect(
      screen.getByRole("heading", { name: /Les comparaisons ne sont pas encore ouvertes/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /index des thématiques/i })).not.toBeInTheDocument();
  });

  it("dit l'absence de mesure au lieu d'afficher un compteur nul", () => {
    render(<HubClosedState verifiedMeasureCount={0} themeCount={13} />);
    expect(screen.getByText(/Aucune mesure n'est encore publiée/)).toBeInTheDocument();
  });

  it("accorde le singulier sur une seule mesure", () => {
    render(<HubClosedState verifiedMeasureCount={1} themeCount={13} />);
    expect(screen.getByText(/1 mesure publiée à ce jour/)).toBeInTheDocument();
  });

  it("lit le seuil dans PUBLICATION_GATES plutôt que de le coder en dur", () => {
    render(<HubClosedState verifiedMeasureCount={4} themeCount={13} />);
    const attendu = PUBLICATION_GATES.pageSujet.minCandidaciesWithVerifiedMeasure;
    expect(
      screen.getByText(
        new RegExp(`quand au moins ${attendu} candidatures y portent une mesure sourcée et relue`)
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/aucune des 13 thématiques n'atteint ce seuil/)).toBeInTheDocument();
  });

  it("n'invoque ni neutralité ni absence de classement", () => {
    // Le bloc dit un état de couverture, pas une posture éditoriale.
    const { container } = render(<HubClosedState verifiedMeasureCount={0} themeCount={13} />);
    const texte = (container.textContent ?? "").toLowerCase();
    for (const mot of ["neutralit", "classement", "impartial", "objectivit"]) {
      expect(texte).not.toContain(mot);
    }
  });
});
