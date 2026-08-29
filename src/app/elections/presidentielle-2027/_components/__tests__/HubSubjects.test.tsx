import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HubTheme } from "@/lib/data/hub";
import { HubSubjects } from "../HubSubjects";

function theme(over: Partial<HubTheme> = {}): HubTheme {
  return {
    theme: "LOGEMENT_URBANISME",
    label: "Logement et urbanisme",
    slug: "logement-urbanisme",
    publishable: false,
    ...over,
  };
}

describe("HubSubjects", () => {
  it("nomme chaque thématique et la lie à sa page, thématiques fermées comprises", () => {
    render(
      <HubSubjects
        themes={[
          theme(),
          theme({ theme: "SANTE", label: "Santé", slug: "sante", publishable: true }),
        ]}
      />
    );

    expect(screen.getByRole("link", { name: /Logement et urbanisme/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/themes/logement-urbanisme"
    );
    // Une thématique fermée reste cliquable : sa page dit ce qui manque pour l'ouvrir.
    expect(screen.getByRole("link", { name: /Santé/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/themes/sante"
    );
  });

  it("compte les thématiques comparables dans le titre plutôt que d'écrire treize en dur", () => {
    render(
      <HubSubjects
        themes={[
          theme(),
          theme({ theme: "SANTE", slug: "sante", publishable: true }),
          theme({ theme: "EMPLOI_TRAVAIL", slug: "emploi-travail", publishable: true }),
        ]}
      />
    );
    expect(
      screen.getByRole("heading", { name: "2 thématiques peuvent déjà être comparées" })
    ).toBeInTheDocument();
  });

  it("ne répète aucun badge de comparaison dans les cartes", () => {
    render(
      <HubSubjects
        themes={[
          theme(),
          theme({ theme: "SANTE", label: "Santé", slug: "sante", publishable: true }),
        ]}
      />
    );

    expect(screen.queryByText("Comparaison ouverte")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "1 thématique peut déjà être comparée" })
    ).toBeInTheDocument();
  });

  it("calcule aussi le titre quand aucune comparaison n'est ouverte", () => {
    render(<HubSubjects themes={[theme(), theme({ theme: "SANTE", slug: "sante" })]} />);

    expect(
      screen.getByRole("heading", { name: "0 thématiques peuvent déjà être comparées" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Comparaison ouverte")).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("n'affiche aucun compteur de mesures, qui n'aurait pas la même définition que l'index", () => {
    render(<HubSubjects themes={[theme()]} />);

    expect(screen.queryByText(/mesures? document/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /index des thématiques/i })).not.toBeInTheDocument();
  });
});
