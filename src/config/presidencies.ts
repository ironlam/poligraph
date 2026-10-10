// Présidences de la Ve République, pour regrouper les gouvernements. Pur, sans directive.
// Les intérims d'Alain Poher (1969, 1974) ne sont pas des présidences : aucun Premier ministre
// n'y a été nommé. Bornes en jours calendaires `YYYY-MM-DD`, incluses ; le jour de passation
// figure dans les deux présidences et revient au président entrant (voir `presidencyOn`).
// Sources : page de chaque président sur elysee.fr (vérifiées le 2026-10-10).

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
    sourceUrl: "https://www.elysee.fr/charles-de-gaulle",
  },
  {
    slug: "pompidou",
    name: "Georges Pompidou",
    heading: "Présidence de Georges Pompidou",
    from: "1969-06-20",
    to: "1974-04-02",
    sourceUrl: "https://www.elysee.fr/georges-pompidou",
  },
  {
    slug: "giscard-d-estaing",
    name: "Valéry Giscard d'Estaing",
    heading: "Présidence de Valéry Giscard d'Estaing",
    from: "1974-05-27",
    to: "1981-05-21",
    sourceUrl: "https://www.elysee.fr/valery-giscard-d-estaing",
  },
  {
    slug: "mitterrand",
    name: "François Mitterrand",
    heading: "Présidence de François Mitterrand",
    from: "1981-05-21",
    to: "1995-05-17",
    sourceUrl: "https://www.elysee.fr/francois-mitterrand",
  },
  {
    slug: "chirac",
    name: "Jacques Chirac",
    heading: "Présidence de Jacques Chirac",
    from: "1995-05-17",
    to: "2007-05-16",
    sourceUrl: "https://www.elysee.fr/jacques-chirac",
  },
  {
    slug: "sarkozy",
    name: "Nicolas Sarkozy",
    heading: "Présidence de Nicolas Sarkozy",
    from: "2007-05-16",
    to: "2012-05-15",
    sourceUrl: "https://www.elysee.fr/nicolas-sarkozy",
  },
  {
    slug: "hollande",
    name: "François Hollande",
    heading: "Présidence de François Hollande",
    from: "2012-05-15",
    to: "2017-05-14",
    sourceUrl: "https://www.elysee.fr/francois-hollande",
  },
  {
    slug: "macron",
    name: "Emmanuel Macron",
    heading: "Présidence d'Emmanuel Macron",
    from: "2017-05-14",
    to: null,
    sourceUrl: "https://www.elysee.fr/emmanuel-macron",
  },
];

/**
 * Présidence en cours au jour `day`, bornes incluses. Un jour de passation appartient au
 * président entrant (Ayrault, Juppé, Mauroy ont été nommés le jour même de l'investiture).
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
