import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BallotDay } from "../BallotDay";
import { ScrutinRules } from "../ScrutinRules";

describe("BallotDay : le jour du scrutin", () => {
  /**
   * « Aujourd'hui » est relatif au lecteur et calculé sur le calendrier de Paris. Au début de
   * la journée parisienne il est encore le 26 en Polynésie française (UTC-10), et sur sa fin
   * il est déjà le 28 à Wallis-et-Futuna (UTC+12). La date accompagne donc le mot, pour qu'un
   * lecteur dont le jour local diffère puisse le constater.
   */
  it("accompagne « aujourd'hui » de la date, jamais seul", () => {
    render(<BallotDay />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).toContain("aujourd'hui");
    expect(heading.textContent).toContain("dimanche 27 septembre");
  });

  it("sépare explicitement les 63 départements du collège des Français de l'étranger", () => {
    render(<BallotDay />);
    expect(screen.getByText(/63 départements et collectivités/)).toBeInTheDocument();
    expect(screen.getByText(/collège distinct des Français établis hors de France/)).toBeVisible();
  });

  /**
   * Le refus est écrit, pas seulement appliqué. Le soir d'un scrutin, un espace vide se
   * lit comme un résultat qui n'a pas fini de charger.
   */
  it("annonce qu'aucun résultat ne sera publié avant la proclamation", () => {
    render(<BallotDay />);
    expect(screen.getByText(/Aucun résultat avant la proclamation/)).toBeInTheDocument();
    expect(screen.getByText(/ni estimation, ni tendance, ni décompte/)).toBeInTheDocument();
  });

  /**
   * Garde-fou sur la donnée plutôt que sur le vocabulaire : le bloc énonce son refus, donc
   * les mots « estimation » et « tendance » y figurent légitimement. Ce qui ne doit jamais
   * apparaître, c'est un chiffre qui ressemble à un résultat.
   */
  it("ne rend aucun pourcentage ni décompte de sièges", () => {
    const { container } = render(<BallotDay />);
    const text = container.textContent ?? "";
    expect(text).not.toContain("%");
    expect(text).not.toMatch(/\d+\s*sièges?\b/);
    expect(text).not.toMatch(/\d+\s*(?:voix|suffrages)\b/);
  });
});

/**
 * Les horaires vivent dans `ScrutinRules` et nulle part ailleurs : ils portent une réserve
 * sur la 64e circonscription, et une réserve affichée deux fois est une réserve qui
 * finira par diverger.
 */
describe("ScrutinRules : les horaires du décret", () => {
  it("ferme la proportionnelle à 17 h 30, et non à 17 h comme la maquette", () => {
    render(<ScrutinRules />);
    expect(screen.getByText(/Scrutin de 8 h 30 à 17 h 30/)).toBeInTheDocument();
  });

  it("donne les deux tours du scrutin majoritaire", () => {
    render(<ScrutinRules />);
    expect(
      screen.getByText(/1er tour de 8 h 30 à 11 h, second tour s'il y a lieu de 15 h 30 à 17 h 30/)
    ).toBeInTheDocument();
  });

  /**
   * L. 294 pose deux conditions cumulatives au premier tour : majorité absolue des suffrages
   * exprimés ET quart des électeurs inscrits. N'en citer qu'une présentait une condition
   * nécessaire comme suffisante.
   */
  it("énonce les deux conditions cumulatives du premier tour, pas seulement la majorité absolue", () => {
    render(<ScrutinRules />);
    expect(screen.getByText(/majorité absolue des suffrages exprimés/)).toBeInTheDocument();
    expect(screen.getByText(/quart des électeurs inscrits/)).toBeInTheDocument();
  });

  it("cite la section du mode de scrutin, dont les seuils affichés proviennent", () => {
    render(<ScrutinRules />);
    expect(
      screen.getByRole("link", { name: /Code électoral, art\. L\. 294 à L\. 295/ })
    ).toBeInTheDocument();
  });

  /**
   * Le décret du 21 avril ne convoque pas ce collège, donc il n'en fixe pas les horaires.
   * Ce n'est pas la même chose que « aucun horaire officiel n'existe » : un texte
   * spécifique en fixera, comme en 2023. La formulation doit survivre à sa publication.
   */
  it("n'étend pas ces horaires au collège des Français de l'étranger", () => {
    render(<ScrutinRules />);
    expect(screen.getByText(/relève d'un dispositif distinct/)).toBeInTheDocument();
    expect(
      screen.getByText(/Le décret du 21 avril 2026 ne fixe pas les horaires de ce collège/)
    ).toBeInTheDocument();
  });

  it("ne prétend pas qu'aucun horaire officiel n'existe pour ce collège", () => {
    const { container } = render(<ScrutinRules />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/aucun horaire n'est (connu|publié|fixé)/i);
    expect(text).not.toMatch(/nous n'en affichons donc aucun/i);
  });

  it("cite le décret, puisqu'il est la source des horaires", () => {
    render(<ScrutinRules />);
    expect(screen.getByRole("link", { name: /Décret n° 2026-301/ })).toBeInTheDocument();
  });

  /**
   * « Série » porte toute la page et n'était défini nulle part. La définition est dans le
   * texte, pas seulement dans l'infobulle de l'en-tête : une explication derrière un survol
   * est hors d'atteinte au doigt.
   */
  /**
   * R. 168 alinéa 3, en vigueur depuis le 20 novembre 2020 : « Dans les deux cas, si le
   * président du bureau du collège électoral constate que dans toutes les sections de vote
   * tous les électeurs ont pris part au vote, il peut déclarer le scrutin clos avant les
   * heures fixées ci-dessus. » Les heures affichées sont donc des bornes. Avec le vote
   * obligatoire (L. 318) et des collèges de quelques centaines à quelques milliers
   * d'électeurs, la clôture anticipée est ordinaire, pas théorique.
   */
  it("dit que les heures de clôture sont des bornes, pas des horaires garantis", () => {
    render(<ScrutinRules />);
    expect(screen.getByText(/Ces heures sont des bornes, pas des horaires garantis/)).toBeVisible();
    expect(screen.getByText(/peut déclarer le scrutin clos plus tôt/)).toBeInTheDocument();
  });

  it("cite R. 168 sous l'affirmation qui en découle, et pas seulement la plage L. 280 à L. 293", () => {
    render(<ScrutinRules />);
    expect(screen.getByRole("link", { name: /Code électoral, art\. R\. 168/ })).toBeInTheDocument();
  });

  it("définit ce qu'est une série, en clair et dans la page", () => {
    render(<ScrutinRules />);
    expect(screen.getByText(/Le Sénat se renouvelle par moitié tous les trois ans/)).toBeVisible();
    expect(screen.getByText(/les 170 de la série 1/)).toBeInTheDocument();
    expect(screen.getByText(/ne dépend pas du sénateur qui l'occupe/)).toBeInTheDocument();
  });
});
