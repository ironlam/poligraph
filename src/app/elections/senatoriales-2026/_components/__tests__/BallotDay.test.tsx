import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BallotDay } from "../BallotDay";
import { ScrutinRules } from "../ScrutinRules";
import * as content from "../../_content";

/**
 * Aucun terme relatif au lecteur dans le contenu éditorial du hub.
 *
 * Le premier correctif n'avait traité que le titre de `BallotDay` ; le badge de `page.tsx` et
 * trois phrases de `CommuneLookup` portaient le même défaut et y ont survécu parce qu'ils
 * vivent dans d'autres fichiers. Ce test balaie le module de contenu, qui centralise la prose,
 * pour qu'un « aujourd'hui » ne puisse pas rentrer par une porte latérale.
 */
describe("contenu du hub : aucun terme relatif au lecteur", () => {
  const RELATIVE = ["aujourd'hui", "actuellement", "en ce moment", "à cette heure"];

  it("n'emploie aucun terme relatif dans les chaînes publiées", () => {
    const strings: string[] = [];
    const walk = (value: unknown) => {
      if (typeof value === "string") strings.push(value);
      else if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") Object.values(value).forEach(walk);
    };
    walk(content);

    expect(strings.length).toBeGreaterThan(20);
    for (const s of strings) {
      for (const term of RELATIVE) {
        expect(s.toLowerCase(), `"${s.slice(0, 70)}"`).not.toContain(term);
      }
    }
  });
});

describe("BallotDay : le jour du scrutin", () => {
  /**
   * Aucun terme relatif au lecteur.
   *
   * « Aujourd'hui » était calculé sur le calendrier de Paris : faux pour un lecteur dont le
   * jour local était encore le 26 en Polynésie française (UTC-10) ou déjà le 28 à
   * Wallis-et-Futuna (UTC+12). Afficher la date à côté rendait la contradiction visible sans
   * rendre le mot vrai. Le garde temporel parisien reste, l'affirmation publiée est une date.
   */
  it("ne publie aucun terme relatif au lecteur, seulement la date", () => {
    render(<BallotDay />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).toContain("ce dimanche 27 septembre");
    for (const relative of ["aujourd'hui", "actuellement", "en ce moment", "maintenant"]) {
      expect(heading.textContent?.toLowerCase(), relative).not.toContain(relative);
    }
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
   * Le collège des Français de l'étranger a bien un horaire légal, et il est en vigueur :
   * article 50 du décret n° 2014-290, 9 h à 15 h, avec la même faculté de clôture anticipée.
   * Dire seulement que le décret du 21 avril ne le fixe pas était vrai et masquait une règle
   * publiée. On publie donc l'horaire réel avec sa source.
   */
  it("publie les horaires propres au collège des Français de l'étranger", () => {
    render(<ScrutinRules />);
    expect(screen.getByText(/relèvent d'un dispositif distinct/)).toBeInTheDocument();
    expect(screen.getByText(/de 9 h à 15 h/)).toBeInTheDocument();
    expect(screen.getByText(/que le décret du 21 avril 2026 ne convoque pas/)).toBeInTheDocument();
  });

  it("ne prétend plus qu'aucun horaire n'existe pour ce collège", () => {
    const { container } = render(<ScrutinRules />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/aucun horaire n'est (connu|publié|fixé)/i);
    expect(text).not.toMatch(/ne fixe pas les horaires de ce collège/i);
    expect(text).not.toMatch(/nous n'en affichons donc aucun/i);
  });

  it("cite le décret de 2014, dont proviennent ces horaires", () => {
    render(<ScrutinRules />);
    expect(screen.getByRole("link", { name: /Décret n° 2014-290, art\. 50/ })).toBeInTheDocument();
  });

  it("cite le décret, puisqu'il est la source des horaires", () => {
    render(<ScrutinRules />);
    expect(screen.getByRole("link", { name: /Décret n° 2026-301/ })).toBeInTheDocument();
  });

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
