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
  it("nomme chaque sujet et le lie à sa page, sujets fermés compris", () => {
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
      "/elections/presidentielle-2027/sujets/logement-urbanisme"
    );
    // Un sujet fermé reste cliquable : sa page dit ce qui manque pour l'ouvrir.
    expect(screen.getByRole("link", { name: /Santé/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/sujets/sante"
    );
  });

  it("compte les sujets dans le titre plutôt que d'écrire treize en dur", () => {
    render(<HubSubjects themes={[theme(), theme({ theme: "SANTE", slug: "sante" })]} />);
    expect(screen.getByRole("heading", { name: "Les 2 sujets suivis" })).toBeInTheDocument();
  });

  it("ne signale « comparaison ouverte » que sur les sujets publiables", () => {
    render(
      <HubSubjects
        themes={[
          theme(),
          theme({ theme: "SANTE", label: "Santé", slug: "sante", publishable: true }),
        ]}
      />
    );

    expect(screen.getAllByText("Comparaison ouverte")).toHaveLength(1);
    expect(screen.getByText(/1 sujet est ouvert à la comparaison/)).toBeInTheDocument();
  });

  it("dit qu'aucune comparaison n'est ouverte au lancement, sans masquer les sujets", () => {
    render(<HubSubjects themes={[theme(), theme({ theme: "SANTE", slug: "sante" })]} />);

    expect(
      screen.getByText(/Aucun sujet n'est encore ouvert à la comparaison/)
    ).toBeInTheDocument();
    expect(screen.queryByText("Comparaison ouverte")).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("n'affiche aucun compteur de mesures, qui n'aurait pas la même définition que l'index", () => {
    render(<HubSubjects themes={[theme()]} />);

    expect(screen.queryByText(/mesures? document/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Voir l'index des sujets/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/sujets"
    );
  });
});
