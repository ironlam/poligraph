// Présidences de la Ve République, pour regrouper les gouvernements. Pur, sans directive.
// Les intérims d'Alain Poher (1969, 1974) ne sont pas des présidences : aucun Premier ministre
// n'y a été nommé. Bornes en jours calendaires `YYYY-MM-DD`, incluses ; le jour de passation
// figure dans les deux présidences et revient au président entrant (voir `presidencyOn`).
// `from`/`to` sont les dates de prise et de fin de fonction. `sourceUrl` pointe vers la
// proclamation des résultats de l'élection par le Conseil constitutionnel quand elle a pu être
// vérifiée (le 2026-10-10) : elle établit l'élection, pas le jour de prise de fonction. Les
// autres sources sont à compléter (le site du Conseil a cessé de répondre pendant la
// vérification) ; `null` plutôt qu'une URL non vérifiée.

export type Presidency = {
  slug: string;
  name: string;
  /** « Présidence de Charles de Gaulle », « Présidence d'Emmanuel Macron ». */
  heading: string;
  from: string;
  /** `null` : présidence en cours. */
  to: string | null;
  sourceUrl: string | null;
};

/** Ordre chronologique. */
export const PRESIDENCIES: readonly Presidency[] = [
  {
    slug: "de-gaulle",
    name: "Charles de Gaulle",
    heading: "Présidence de Charles de Gaulle",
    from: "1959-01-08",
    to: "1969-04-28",
    sourceUrl: null,
  },
  {
    slug: "pompidou",
    name: "Georges Pompidou",
    heading: "Présidence de Georges Pompidou",
    from: "1969-06-20",
    to: "1974-04-02",
    // Décision n° 69-22 PDR du 19 juin 1969.
    sourceUrl: "https://www.conseil-constitutionnel.fr/decision/1969/6922pdr.htm",
  },
  {
    slug: "giscard-d-estaing",
    name: "Valéry Giscard d'Estaing",
    heading: "Présidence de Valéry Giscard d'Estaing",
    from: "1974-05-27",
    to: "1981-05-21",
    // Décision n° 74-32 PDR du 24 mai 1974.
    sourceUrl: "https://www.conseil-constitutionnel.fr/decision/1974/7432pdr.htm",
  },
  {
    slug: "mitterrand",
    name: "François Mitterrand",
    heading: "Présidence de François Mitterrand",
    from: "1981-05-21",
    to: "1995-05-17",
    sourceUrl: null,
  },
  {
    slug: "chirac",
    name: "Jacques Chirac",
    heading: "Présidence de Jacques Chirac",
    from: "1995-05-17",
    to: "2007-05-16",
    sourceUrl: null,
  },
  {
    slug: "sarkozy",
    name: "Nicolas Sarkozy",
    heading: "Présidence de Nicolas Sarkozy",
    from: "2007-05-16",
    to: "2012-05-15",
    sourceUrl: null,
  },
  {
    slug: "hollande",
    name: "François Hollande",
    heading: "Présidence de François Hollande",
    from: "2012-05-15",
    to: "2017-05-14",
    sourceUrl: null,
  },
  {
    slug: "macron",
    name: "Emmanuel Macron",
    heading: "Présidence d'Emmanuel Macron",
    from: "2017-05-14",
    to: null,
    sourceUrl: null,
  },
];

/**
 * Présidence en cours au jour `day`, bornes incluses. Un jour de passation appartient au
 * président entrant : un Premier ministre nommé ce jour-là l'est par le nouveau président.
 * `null` hors de toute présidence (avant 1959, intérims).
 */
export function presidencyOn(day: string): Presidency | null {
  for (let i = PRESIDENCIES.length - 1; i >= 0; i--) {
    const p = PRESIDENCIES[i]!;
    if (p.from <= day && (p.to === null || day <= p.to)) return p;
  }
  return null;
}

/** Un gouvernement appartient à la présidence pendant laquelle son Premier ministre a été nommé. */
export function presidencyOfGovernment(gov: {
  primeMinisterAppointedAt: string;
}): Presidency | null {
  return presidencyOn(gov.primeMinisterAppointedAt);
}
