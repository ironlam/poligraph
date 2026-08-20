import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HubCandidacy } from "@/lib/data/hub";
import { HubCandidacyField } from "../HubCandidacyField";

function candidacy(over: Partial<HubCandidacy> = {}): HubCandidacy {
  return {
    id: "c1",
    candidateName: "Alix Dupont",
    politicianSlug: null,
    photoUrl: null,
    blobPhotoUrl: null,
    status: "PRESSENTI",
    sourceUrl: "https://example.org/source",
    sourceLabel: "Le Monde",
    partyLabel: "Parti Test",
    partyColor: "#ff0000",
    partyShortName: "PT",
    partyLogoUrl: null,
    measureCount: 0,
    themesCoveredCount: 0,
    programmeAbsence: "aucun_programme",
    ficheAvailable: false,
    ...over,
  };
}

function cardFor(name: string): HTMLElement {
  const card = screen.getByText(name).closest("li");
  if (!(card instanceof HTMLElement)) throw new Error(`Carte introuvable pour ${name}`);
  return card;
}

describe("HubCandidacyField", () => {
  it("sépare le statut de candidature de ce que Poligraph publie", () => {
    render(<HubCandidacyField candidacies={[candidacy()]} />);

    expect(screen.getByText("Candidature pressentie")).toBeInTheDocument();
    expect(screen.getByText("Aucune mesure publiée sur Poligraph")).toBeInTheDocument();
    expect(screen.queryByText("Pressentie · aucun programme")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Une mesure publiée sur Poligraph est une proposition sourcée/)
    ).toBeInTheDocument();
  });

  it("affiche la photo du candidat et le logo du parti quand ils existent", () => {
    const { container } = render(
      <HubCandidacyField
        candidacies={[
          candidacy({
            photoUrl: "https://example.org/alix.jpg",
            partyLogoUrl: "https://example.org/parti.svg",
          }),
        ]}
      />
    );

    expect(screen.getByAltText("Alix Dupont")).toBeInTheDocument();
    expect(container.querySelector('[data-party-logo="true"]')).not.toBeNull();
    expect(screen.getByText("Parti Test")).toBeInTheDocument();
  });

  it("donne la priorité visuelle à la fiche interne, jamais à la source externe", () => {
    render(
      <HubCandidacyField
        candidacies={[
          candidacy({
            politicianSlug: "alix-dupont",
            status: "DECLARE",
            measureCount: 4,
            themesCoveredCount: 2,
            programmeAbsence: null,
            ficheAvailable: true,
          }),
        ]}
      />
    );

    const candidature = screen.getByRole("link", { name: /Voir les mesures/ });
    expect(candidature).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/candidats/alix-dupont"
    );
    expect(candidature).toHaveAttribute("data-variant", "default");

    const source = screen.getByRole("link", { name: /Source du statut de Alix Dupont/ });
    expect(source).toHaveTextContent("Source du statut");
    expect(source).not.toHaveAttribute("data-variant");
    expect(source).toHaveAttribute("target", "_blank");
  });

  it("renvoie vers le profil général quand la page de candidature n'est pas publiable", () => {
    render(
      <HubCandidacyField
        candidacies={[
          candidacy({ politicianSlug: "alix-dupont", status: "DECLARE", ficheAvailable: false }),
        ]}
      />
    );

    expect(screen.queryByRole("link", { name: /Voir les mesures/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Voir le profil politique/ })).toHaveAttribute(
      "href",
      "/politiques/alix-dupont"
    );
    expect(
      screen.getByText("La page de candidature n'est pas encore publiée sur Poligraph.")
    ).toBeInTheDocument();
  });

  it("distingue l'absence de programme de notre travail d'intégration", () => {
    render(
      <HubCandidacyField
        candidacies={[
          candidacy({ id: "c1", candidateName: "Sans programme" }),
          candidacy({
            id: "c2",
            candidateName: "Programme en cours",
            programmeAbsence: "non_depouille",
          }),
        ]}
      />
    );

    expect(
      within(cardFor("Sans programme")).getByText("Aucun programme de campagne publié à ce jour.")
    ).toBeInTheDocument();
    expect(
      within(cardFor("Programme en cours")).getByText(
        "Un programme a été repéré ; ses mesures sont en cours de traitement par Poligraph."
      )
    ).toBeInTheDocument();
  });

  it("ne suppose jamais qu'aucun programme n'existe quand notre état est inconnu", () => {
    render(<HubCandidacyField candidacies={[candidacy({ programmeAbsence: null })]} />);

    expect(
      screen.getByText("Cette candidature n’a pas encore été traitée par Poligraph.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/Aucun programme de campagne/i)).not.toBeInTheDocument();
  });

  it("présente les mesures comme des contenus publiés et précise leur répartition", () => {
    render(
      <HubCandidacyField
        candidacies={[
          candidacy({
            status: "DECLARE",
            measureCount: 12,
            themesCoveredCount: 8,
            programmeAbsence: null,
          }),
        ]}
      />
    );

    expect(screen.getByText("12 mesures publiées sur Poligraph")).toBeInTheDocument();
    expect(screen.getByText("Disponibles dans 8 des 13 sujets suivis")).toBeInTheDocument();
    expect(screen.queryByText(/documenté/i)).not.toBeInTheDocument();
  });

  it("compte seulement les candidatures réellement sans programme publié", () => {
    render(
      <HubCandidacyField
        candidacies={[
          candidacy({ id: "c1", programmeAbsence: "aucun_programme" }),
          candidacy({ id: "c2", programmeAbsence: "non_depouille" }),
          candidacy({ id: "c3", measureCount: 4, themesCoveredCount: 2, programmeAbsence: null }),
        ]}
      />
    );

    expect(
      screen.getByText("1 candidature n’a publié aucun programme à ce jour.")
    ).toBeInTheDocument();
  });

  it("réduit une candidature retirée à son état et ne présente plus ses mesures comme défendues", () => {
    render(
      <HubCandidacyField
        candidacies={[
          candidacy({
            status: "RETIRE",
            measureCount: 7,
            themesCoveredCount: 3,
            programmeAbsence: null,
          }),
        ]}
      />
    );

    expect(screen.getAllByText("Candidature retirée")[0]?.className).toContain("font-semibold");
    expect(screen.queryByText(/7 mesures/)).not.toBeInTheDocument();
    expect(screen.getByText("Alix Dupont").className).toContain("line-through");
  });

  it("garde la source vérifiable mais secondaire et sécurise le lien externe", () => {
    const sourceLabel =
      "Lutte ouvrière : conférence de presse annonçant la candidature le 8 décembre 2025";
    render(<HubCandidacyField candidacies={[candidacy({ sourceLabel })]} />);

    const source = screen.getByRole("link", { name: new RegExp(sourceLabel.slice(0, 25)) });
    expect(source).toHaveAttribute("title", sourceLabel);
    expect(source).toHaveAttribute("href", "https://example.org/source");
    expect(source).toHaveAttribute("rel", expect.stringContaining("nofollow"));
    expect(source).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(source).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
    expect(source).toHaveAttribute("target", "_blank");
  });

  it("annonce le tri réellement appliqué et le filtre compréhensible", () => {
    render(<HubCandidacyField candidacies={[candidacy()]} />);

    expect(screen.getByText("Classement alphabétique par nom de famille.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Avec des mesures · 0" })).toBeInTheDocument();
  });
});
