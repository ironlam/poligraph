import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HubCandidacy } from "@/lib/data/hub";
import { HubCandidacyField } from "../HubCandidacyField";

function candidacy(over: Partial<HubCandidacy> = {}): HubCandidacy {
  return {
    id: "c1",
    candidateName: "Alix Dupont",
    politicianSlug: null,
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

describe("HubCandidacyField", () => {
  it("rend une ligne par candidature, avec son statut honnête", () => {
    const candidacies: HubCandidacy[] = [
      candidacy({ id: "c1", candidateName: "Alix Dupont", politicianSlug: "alix-dupont" }),
      candidacy({
        id: "c2",
        candidateName: "Bruno Martin",
        status: "ENVISAGE",
        politicianSlug: null,
      }),
    ];

    render(<HubCandidacyField candidacies={candidacies} />);

    expect(screen.getByText("Alix Dupont")).toBeInTheDocument();
    expect(screen.getByText("Bruno Martin")).toBeInTheDocument();
    expect(screen.getByText("Candidature pressentie")).toBeInTheDocument();
    expect(screen.getByText("Candidature évoquée")).toBeInTheDocument();
  });

  it("nomme les deux destinations quand la fiche de candidature existe", () => {
    // La régression que ça verrouille : un lien unique sur le nom, vers une page qui redirige
    // silencieusement vers /politiques/[slug] sous le seuil de publication. Le même geste menait
    // à deux pages différentes selon une règle invisible, sans jamais dire laquelle.
    render(
      <HubCandidacyField
        candidacies={[
          candidacy({ politicianSlug: "alix-dupont", ficheAvailable: true, measureCount: 4 }),
        ]}
      />
    );

    expect(screen.getAllByRole("link", { name: /Sa candidature/ })[0]).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/candidats/alix-dupont"
    );
    expect(screen.getAllByRole("link", { name: /Sa fiche Poligraph/ })[0]).toHaveAttribute(
      "href",
      "/politiques/alix-dupont"
    );
  });

  it("annonce l'absence de fiche de candidature au lieu d'y mener quand même", () => {
    render(
      <HubCandidacyField
        candidacies={[candidacy({ politicianSlug: "alix-dupont", ficheAvailable: false })]}
      />
    );

    expect(screen.getAllByText("Fiche de candidature à venir").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /Sa candidature/ })).not.toBeInTheDocument();
    // La fiche Poligraph, elle, existe toujours : le lecteur n'est jamais laissé sans issue.
    expect(screen.getAllByRole("link", { name: /Sa fiche Poligraph/ })[0]).toHaveAttribute(
      "href",
      "/politiques/alix-dupont"
    );
  });

  it("n'affiche pas de badge sur une candidature déclarée", () => {
    // Vingt lignes sur vingt-cinq portent le même statut : le répéter n'informe pas, ce sont les
    // exceptions qui informent.
    render(<HubCandidacyField candidacies={[candidacy({ status: "DECLARE" })]} />);
    expect(screen.queryByText("Candidature déclarée")).not.toBeInTheDocument();
    expect(screen.getByText("Alix Dupont")).toBeInTheDocument();
  });

  it("distingue « aucun programme publié » de « pas encore documenté »", () => {
    // La régression que ça verrouille : afficher le même vide dans les deux cas imputerait notre
    // propre retard au candidat.
    const { container } = render(
      <HubCandidacyField
        candidacies={[
          candidacy({ id: "c1", candidateName: "Sans programme" }),
          candidacy({
            id: "c2",
            candidateName: "Non documenté",
            programmeAbsence: "non_depouille",
          }),
        ]}
      />
    );

    expect(screen.getAllByText("Aucun programme publié à ce jour").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Programme publié, pas encore documenté").length).toBeGreaterThan(0);
    expect(container.querySelector('[data-programme-absence="non_depouille"]')).not.toBeNull();
  });

  it("compte les candidatures sans programme, et jamais celles que nous n'avons pas documentées", () => {
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
      screen.getByText(/1 candidature n'a publié aucun programme à ce jour/)
    ).toBeInTheDocument();
  });

  it("rend le compte de mesures avec son unité accordée et sa couverture", () => {
    render(
      <HubCandidacyField
        candidacies={[
          candidacy({ id: "c1", measureCount: 1, themesCoveredCount: 1, programmeAbsence: null }),
          candidacy({ id: "c2", measureCount: 12, themesCoveredCount: 8, programmeAbsence: null }),
        ]}
      />
    );

    expect(screen.getAllByText("mesure documentée").length).toBeGreaterThan(0);
    expect(screen.getAllByText("mesures documentées").length).toBeGreaterThan(0);
    expect(screen.getAllByText("8 sur 13 sujets").length).toBeGreaterThan(0);
  });

  it("porte la citation de source en title, jamais en pleine ligne", () => {
    // `sourceLabel` contient des phrases entières (jusqu'à ~115 caractères). Sur l'ancienne carte
    // c'était l'élément le plus voyant de la ligne ; une source doit être vérifiable, pas dominante.
    const longue =
      "Lutte ouvrière : « nous avons voté que je serai candidate pour Lutte ouvrière », conférence de presse du 8 décembre 2025";
    render(<HubCandidacyField candidacies={[candidacy({ sourceLabel: longue })]} />);

    // Deux rendus : la colonne au-dessus de lg, le repli en dessous. Les deux doivent porter la
    // source, sinon un lecteur mobile ne peut plus vérifier le statut affiché.
    const liens = screen.getAllByRole("link", { name: new RegExp(longue.slice(0, 20)) });
    expect(liens).toHaveLength(2);
    for (const lien of liens) {
      expect(lien).toHaveAttribute("title", longue);
      expect(lien).toHaveAttribute("href", "https://example.org/source");
      expect(lien).toHaveAttribute("rel", expect.stringContaining("noopener"));
    }
  });

  it("annonce le critère de tri réellement appliqué", () => {
    // Le tri se fait sur `politician.lastName`, pas sur `candidateName` qui est « Prénom Nom ».
    render(<HubCandidacyField candidacies={[candidacy()]} />);
    expect(screen.getByText("Candidatures classées par nom de famille.")).toBeInTheDocument();
  });
});
