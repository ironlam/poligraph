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
    ...over,
  };
}

describe("HubCandidacyField", () => {
  it("rend une ligne par candidature, avec son statut honnête et le lien vers sa fiche", () => {
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

    // La route candidat existe depuis #679 et redirige vers /politiques/[slug] sous le seuil de
    // publication, donc un seul href suffit pour les 25 lignes sans fabriquer de lien mort.
    expect(screen.getByRole("link", { name: /Alix Dupont/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/candidats/alix-dupont"
    );
  });

  it("n'affiche pas de badge sur une candidature déclarée", () => {
    // Vingt lignes sur vingt-cinq portent le même statut : le répéter n'informe pas, ce sont les
    // exceptions qui informent.
    render(<HubCandidacyField candidacies={[candidacy({ status: "DECLARE" })]} />);
    expect(screen.queryByText("Candidature déclarée")).not.toBeInTheDocument();
    expect(screen.getByText("Alix Dupont")).toBeInTheDocument();
  });

  it("distingue « aucun programme publié » de « pas encore dépouillé »", () => {
    // La régression que ça verrouille : afficher le même vide dans les deux cas imputerait notre
    // propre retard au candidat.
    const { container } = render(
      <HubCandidacyField
        candidacies={[
          candidacy({ id: "c1", candidateName: "Sans programme" }),
          candidacy({
            id: "c2",
            candidateName: "Non dépouillé",
            programmeAbsence: "non_depouille",
          }),
        ]}
      />
    );

    expect(screen.getAllByText("Aucun programme publié à ce jour").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Programme publié, pas encore dépouillé").length).toBeGreaterThan(0);
    expect(container.querySelector('[data-programme-absence="non_depouille"]')).not.toBeNull();
  });

  it("compte les candidatures sans programme, et jamais celles que nous n'avons pas dépouillées", () => {
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

    expect(screen.getAllByText("mesure dépouillée").length).toBeGreaterThan(0);
    expect(screen.getAllByText("mesures dépouillées").length).toBeGreaterThan(0);
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
