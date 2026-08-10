import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CandidacyDeposit } from "../CandidacyDeposit";
import type { CandidacyPhase } from "@/lib/senatoriales/timing";

const ALL_PHASES: CandidacyPhase[] = ["before", "open", "closed", "unknown"];

describe("CandidacyDeposit : la phase change la formulation", () => {
  it("avant l'ouverture, annonce la période au futur", () => {
    render(<CandidacyDeposit phase="before" ballotPhase="before" />);
    expect(
      screen.getByText(/Le dépôt des candidatures n'est pas encore ouvert/)
    ).toBeInTheDocument();
    expect(screen.getByText(/seront reçues du 7 au 11 septembre 2026/)).toBeInTheDocument();
  });

  it("pendant la période, dit que le dépôt est en cours", () => {
    render(<CandidacyDeposit phase="open" ballotPhase="before" />);
    expect(screen.getByText(/Le dépôt des candidatures est en cours/)).toBeInTheDocument();
    expect(screen.getByText(/sont reçues du 7 au 11 septembre 2026/)).toBeInTheDocument();
  });

  /**
   * L'article 2 rouvre le dépôt le jour du scrutin, jusqu'à 15 h, pour un second tour au
   * scrutin majoritaire. C'est ce qui rend possible l'ouverture à 15 h 30, donc le bloc le
   * dit au lieu de laisser croire que tout est joué depuis le 11.
   */
  it("après la période, énonce la règle du second tour", () => {
    render(<CandidacyDeposit phase="closed" ballotPhase="before" />);
    expect(screen.getByText(/Le dépôt pour le premier tour est terminé/)).toBeInTheDocument();
    expect(screen.getByText(/le jour du scrutin jusqu'à 15 h/)).toBeInTheDocument();
  });

  /**
   * Régression : la phase de dépôt reste « closed » après le 27 septembre, donc un texte
   * annonçant qu'un second tour « peut recevoir » des déclarations survivrait au scrutin.
   * Même défaut que la composition sortante : rien ne casse, la page se met à affirmer
   * quelque chose qui a cessé d'être vrai.
   */
  it("une fois le scrutin passé, ne présente plus le second tour comme à venir", () => {
    render(<CandidacyDeposit phase="closed" ballotPhase="after" />);
    expect(screen.getByText(/ont été reçues du 7 au 11 septembre 2026/)).toBeInTheDocument();
    expect(screen.getByText(/pouvait recevoir/)).toBeInTheDocument();
    expect(screen.queryByText(/peuvent être déposées/)).toBeNull();
  });

  it("sans dates enregistrées, dit ne pas savoir plutôt que de déduire un calendrier", () => {
    render(<CandidacyDeposit phase="unknown" ballotPhase="before" />);
    expect(screen.getByText(/Période de dépôt non renseignée/)).toBeInTheDocument();
    expect(screen.getByText(/Nous ne les déduisons pas du calendrier/)).toBeInTheDocument();
  });
});

/**
 * L'heure de l'article 2 est locale à la circonscription de dépôt. Une page nationale ne
 * peut donc pas dire « le dépôt est clos depuis 18 h » : elle situe l'heure là où le dépôt
 * se fait, et décrit la période plutôt qu'un état à la minute.
 */
describe("CandidacyDeposit : l'heure est située, jamais nationale", () => {
  it("rattache les 18 h aux services du représentant de l'État", () => {
    render(<CandidacyDeposit phase="open" ballotPhase="before" />);
    expect(
      screen.getByText(
        /jusqu'à 18 h auprès des services du représentant de l'État dans la circonscription concernée/
      )
    ).toBeInTheDocument();
  });

  /**
   * Les 15 h du second tour sont aussi locales que les 18 h. Elles ne portaient aucune
   * localisation, donc un lecteur à Paris pouvait les lire comme 15 h heure de Paris.
   */
  it("qualifie les 15 h du second tour d'heure locale", () => {
    render(<CandidacyDeposit phase="closed" ballotPhase="before" />);
    expect(
      screen.getByText(/jusqu'à 15 h, heure locale de la circonscription/)
    ).toBeInTheDocument();
  });

  it("ne laisse aucune heure sans localisation dans les états qui en citent une", () => {
    for (const phase of ["before", "open", "closed"] as const) {
      const { container, unmount } = render(
        <CandidacyDeposit phase={phase} ballotPhase="before" />
      );
      const text = container.textContent ?? "";
      // Toute mention d'une heure doit être accompagnée d'une localisation.
      if (/\d+ h\b/.test(text)) {
        expect(text, phase).toMatch(/circonscription|représentant de l'État/);
      }
      unmount();
    }
  });

  it("n'annonce jamais une clôture à l'heure de Paris", () => {
    for (const phase of ALL_PHASES) {
      const { container, unmount } = render(
        <CandidacyDeposit phase={phase} ballotPhase="before" />
      );
      const text = container.textContent ?? "";
      expect(text, phase).not.toMatch(/heure de Paris/i);
      expect(text, phase).not.toMatch(/clos depuis/i);
      unmount();
    }
  });
});

describe("CandidacyDeposit : les absences assumées", () => {
  it("dit dans toutes les phases pourquoi aucun candidat n'est listé", () => {
    for (const phase of ALL_PHASES) {
      const { unmount } = render(<CandidacyDeposit phase={phase} ballotPhase="before" />);
      expect(
        screen.getByText(/Nous ne publions aucune liste de candidats/),
        phase
      ).toBeInTheDocument();
      // « préfecture par préfecture » était faux pour les collectivités à haut-commissariat
      // et pour la 64e circonscription, qui dépose au ministère.
      expect(screen.getByText(/circonscription par circonscription/), phase).toBeInTheDocument();
      unmount();
    }
  });

  /**
   * L'article 1 du décret ne convoque pas les Français de l'étranger. Appliquer le 7 au
   * 11 septembre aux 64 circonscriptions attribuait à ce collège une période qui n'est pas la
   * sienne : l'article 46 de la loi de 2013 fixe un dépôt au ministère des Affaires
   * étrangères, au plus tard le troisième lundi précédant le scrutin à 18 h.
   */
  it("borne la période aux 63 circonscriptions convoquées par le décret", () => {
    for (const phase of ["before", "open"] as const) {
      const { unmount } = render(<CandidacyDeposit phase={phase} ballotPhase="before" />);
      expect(
        screen.getByText(/Dans les 63 départements et collectivités convoqués par le décret/),
        phase
      ).toBeInTheDocument();
      unmount();
    }
  });

  it("traite le régime des Français de l'étranger séparément, avec son lieu et sa date", () => {
    render(<CandidacyDeposit phase="open" ballotPhase="before" />);
    expect(screen.getByText(/ne sont pas convoqués par ce décret/)).toBeInTheDocument();
    expect(screen.getByText(/au ministère des Affaires étrangères/)).toBeInTheDocument();
    expect(screen.getByText(/le lundi 7 septembre 2026 à 18 h/)).toBeInTheDocument();
  });

  /**
   * Le compteur de collecte est interdit : « 21 sur 63 » décrit l'avancement de notre
   * import, et sur une page consacrée à un scrutin il se lit comme un fait sur le
   * scrutin. Ce test échouera si quelqu'un rétablit une jauge.
   */
  it("n'affiche aucun compteur de départements collectés", () => {
    for (const phase of ALL_PHASES) {
      const { container, unmount } = render(
        <CandidacyDeposit phase={phase} ballotPhase="before" />
      );
      const text = container.textContent ?? "";
      expect(text, phase).not.toMatch(/\d+\s*(?:sur|\/)\s*6[34]\b/);
      expect(text, phase).not.toMatch(/circonscriptions? collectées?/i);
      expect(text, phase).not.toMatch(/départements? renseignés?/i);
      unmount();
    }
  });

  it("ne rend aucune liste de candidats, même vide", () => {
    for (const phase of ALL_PHASES) {
      const { unmount } = render(<CandidacyDeposit phase={phase} ballotPhase="before" />);
      expect(screen.queryAllByRole("listitem"), phase).toHaveLength(0);
      unmount();
    }
  });
});
