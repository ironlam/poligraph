import { render, screen, within } from "@testing-library/react";
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
    expect(screen.getByText("Pressentie · aucun programme")).toBeInTheDocument();
    expect(screen.getByText("Évoquée · aucun programme")).toBeInTheDocument();
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

    expect(screen.getByRole("link", { name: /Sa candidature/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/candidats/alix-dupont"
    );
    expect(screen.getByRole("link", { name: /Fiche Poligraph/ })).toHaveAttribute(
      "href",
      "/politiques/alix-dupont"
    );
  });

  it("annonce que c'est NOTRE page qui manque, jamais la candidature", () => {
    // Poligraph ne déclare pas les candidatures : « Candidature à venir » affirmerait sur une
    // personne quelque chose que nous ne sommes pas en position d'affirmer.
    render(
      <HubCandidacyField
        candidacies={[candidacy({ politicianSlug: "alix-dupont", ficheAvailable: false })]}
      />
    );

    expect(screen.getByText("Fiche candidature à venir")).toBeInTheDocument();
    expect(screen.getByText("dès que nous l'aurons documentée")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Sa candidature/ })).not.toBeInTheDocument();
    // La fiche Poligraph, elle, existe toujours : le lecteur n'est jamais laissé sans issue.
    expect(screen.getByRole("link", { name: /Fiche Poligraph/ })).toHaveAttribute(
      "href",
      "/politiques/alix-dupont"
    );
  });

  it("garde l'emplacement de la candidature occupé, jamais étiré ni effondré", () => {
    // Le contrôle avant merge : une ligne sans fiche candidature garde le même alignement qu'une
    // ligne complète. Le placeholder et le lien occupent le même emplacement, de même hauteur, et
    // Poligraph ne s'étale jamais sur la largeur libérée.
    const { container } = render(
      <HubCandidacyField
        candidacies={[
          candidacy({ id: "c1", politicianSlug: "avec", ficheAvailable: true, measureCount: 2 }),
          candidacy({ id: "c2", politicianSlug: "sans", ficheAvailable: false }),
        ]}
      />
    );

    const lignes = container.querySelectorAll("li");
    expect(lignes).toHaveLength(2);

    const avec = within(lignes[0] as HTMLElement).getByRole("link", { name: /Sa candidature/ });
    const sans = within(lignes[1] as HTMLElement).getByText("Fiche candidature à venir")
      .parentElement as HTMLElement;

    for (const emplacement of [avec, sans]) {
      expect(emplacement.className).toContain("min-h-11");
      expect(emplacement.className).toContain("lg:min-h-[32px]");
      expect(emplacement.className).toContain("flex-1");
    }
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

    expect(screen.getByText("Aucun programme publié à ce jour")).toBeInTheDocument();
    expect(screen.getByText("Programme publié, pas encore documenté")).toBeInTheDocument();
    expect(container.querySelector('[data-programme-absence="non_depouille"]')).not.toBeNull();
  });

  it("ne suppose jamais « aucun programme » quand la raison du vide est inconnue", () => {
    // `resolveProgrammeAbsence` ne rend jamais `null` à zéro mesure, donc ce cas ne sort pas de
    // `getHubCandidacyField` aujourd'hui. Le garde reste nécessaire parce qu'il ne coûte rien et
    // qu'il tient la doctrine : affirmer qu'un candidat n'a rien publié, faute de donnée de notre
    // côté, serait une affirmation fausse sur une personne réelle. La troisième phrase ne parle
    // que de nous.
    render(<HubCandidacyField candidacies={[candidacy({ programmeAbsence: null })]} />);

    expect(screen.getByText("Pressentie · non documenté")).toBeInTheDocument();
    expect(screen.getByText("Pas encore documenté par Poligraph")).toBeInTheDocument();
    // `i` : sans lui la regex ne voit pas « Aucun programme publié à ce jour » et le test passe
    // en ne vérifiant rien, ce qui était le cas dans la première version de cette PR.
    expect(screen.queryByText(/aucun programme/i)).not.toBeInTheDocument();
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

  it("fusionne statut et programme dans une seule pastille, avec son unité accordée", () => {
    render(
      <HubCandidacyField
        candidacies={[
          candidacy({
            id: "c1",
            status: "DECLARE",
            measureCount: 1,
            themesCoveredCount: 1,
            programmeAbsence: null,
          }),
          candidacy({
            id: "c2",
            status: "DECLARE",
            measureCount: 12,
            themesCoveredCount: 8,
            programmeAbsence: null,
          }),
        ]}
      />
    );

    expect(screen.getByText("Déclarée · 1 mesure")).toBeInTheDocument();
    expect(screen.getByText("Déclarée · 12 mesures")).toBeInTheDocument();
    // Le compte vit dans la pastille : la ligne du dessous porte ce qu'elle ne peut pas dire.
    expect(screen.getByText("1 sujet documenté sur 13")).toBeInTheDocument();
    expect(screen.getByText("8 sujets documentés sur 13")).toBeInTheDocument();
  });

  it("affiche une pastille sur une candidature déclarée aussi", () => {
    // Changement assumé de la 3e passe : la pastille ne dit plus seulement le statut, elle dit ce
    // que nous avons documenté. Sur une liste où vingt lignes sur vingt-huit sont « déclarée »,
    // c'est la seconde moitié qui informe, et elle diffère d'une ligne à l'autre.
    render(<HubCandidacyField candidacies={[candidacy({ status: "DECLARE" })]} />);
    expect(screen.getByText("Déclarée · aucun programme")).toBeInTheDocument();
  });

  it("réduit une candidature retirée à son statut, et barre le nom", () => {
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

    // Un retrait clôt la candidature : ce que nous avions documenté de son programme n'est plus
    // la question posée.
    expect(screen.getByText("Retirée")).toBeInTheDocument();
    expect(screen.queryByText(/7 mesures/)).not.toBeInTheDocument();
    expect(screen.getByText("Alix Dupont").className).toContain("line-through");
  });

  it("ouvre la source de la déclaration depuis la pastille, et la nomme", () => {
    // `sourceLabel` contient des phrases entières (jusqu'à ~115 caractères). Sur l'ancienne ligne
    // c'était l'élément le plus voyant ; une source doit être vérifiable, pas dominante. Le `title`
    // sert le pointeur, la mention sr-only sert tout le monde : un lien nommé « Déclarée · 19
    // mesures » qui ouvre un site externe sans dire lequel est exactement la surprise à retirer.
    const longue =
      "Lutte ouvrière : « nous avons voté que je serai candidate pour Lutte ouvrière », conférence de presse du 8 décembre 2025";
    render(<HubCandidacyField candidacies={[candidacy({ sourceLabel: longue })]} />);

    const pastille = screen.getByRole("link", { name: new RegExp(longue.slice(0, 20)) });
    expect(pastille).toHaveAttribute("title", longue);
    expect(pastille).toHaveAttribute("href", "https://example.org/source");
    expect(pastille).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(pastille).toHaveAttribute("target", "_blank");
    // La citation entière n'occupe aucune ligne de la grille.
    expect(screen.queryByText(longue)).not.toBeInTheDocument();
  });

  it("garde la pastille inerte quand la source manque", () => {
    render(<HubCandidacyField candidacies={[candidacy({ sourceUrl: null, sourceLabel: null })]} />);

    expect(screen.getByText("Pressentie · aucun programme")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Pressentie/ })).not.toBeInTheDocument();
  });

  it("annonce le critère de tri réellement appliqué", () => {
    // Le tri se fait sur `politician.lastName`, pas sur `candidateName` qui est « Prénom Nom ».
    render(<HubCandidacyField candidacies={[candidacy()]} />);
    expect(screen.getByText("Candidatures classées par nom de famille.")).toBeInTheDocument();
  });
});
