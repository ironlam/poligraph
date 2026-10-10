// Content of /espace-presse: third-party mentions of Poligraph and contributor credits.
// Every entry was read at its source on the date given in consultedAt. Adding a mention or a
// contributor is a one-line change here; bump PRESS_SPACE_UPDATED_AT with it (sitemap lastmod).

export const PRESS_SPACE_UPDATED_AT = "2026-10-10";

export type PressMentionKind = "article" | "site";

export interface PressMention {
  /** Name of the outlet or site, as it presents itself. */
  source: string;
  /** Article headline, or where the mention sits on the site. */
  title: string;
  kind: PressMentionKind;
  url: string;
  /** ISO date of publication, when the source gives one. */
  publishedAt?: string;
  /** Verbatim excerpt, short (right of quotation). */
  quote: string;
  /** ISO date we read the mention at its source. */
  consultedAt: string;
  /** Wayback Machine snapshot taken at or after the check. */
  archiveUrl: string;
}

export const PRESS_MENTIONS: PressMention[] = [
  {
    source: "TF1info",
    title:
      'VÉRIF\' - Qui se cache derrière "Casier Politique", ce site qui recense les condamnations des élus ?',
    kind: "article",
    url: "https://www.tf1info.fr/politique/verif-qui-se-cache-derriere-casier-politique-ce-site-qui-recense-les-condamnations-penales-des-elus-2429306.html",
    publishedAt: "2026-03-10",
    quote:
      '[…] d’autres plateformes non partisanes existent, comme "Poligraph", pour recenser les informations disponibles, mais parfois peu accessibles au grand public, sur les responsables politiques.',
    consultedAt: "2026-10-10",
    archiveUrl:
      "https://web.archive.org/web/20260902010911/https://www.tf1info.fr/politique/verif-qui-se-cache-derriere-casier-politique-ce-site-qui-recense-les-condamnations-penales-des-elus-2429306.html",
  },
  {
    source: "casier-politique.fr",
    title: "Page « À propos », rubrique « Services similaires »",
    kind: "site",
    url: "https://casier-politique.fr/about",
    quote: "Le site Poligraph, sorti depuis peu, est bien plus complet.",
    consultedAt: "2026-10-10",
    archiveUrl: "https://web.archive.org/web/20261010094540/https://casier-politique.fr/about",
  },
  {
    source: "monparlement.fr",
    title: "Page d'accueil, crédits",
    kind: "site",
    url: "https://monparlement.fr/",
    quote: "Autres sites tout aussi admirés : casier-politique.fr, clair.vote, poligraph.fr.",
    consultedAt: "2026-10-10",
    archiveUrl: "https://web.archive.org/web/20261010094611/https://www.monparlement.fr/",
  },
];

export type ContributionVerb = "a contribué" | "a proposé" | "a signalé";

export type ContributionState =
  | "livré"
  | "repris par le mainteneur"
  | "corrigé"
  | "en cours de correction"
  | "à l'étude";

export interface Contribution {
  verb: ContributionVerb;
  label: string;
  url: string;
  state: ContributionState;
}

export interface Contributor {
  /** GitHub handle. */
  handle: string;
  /** ISO date of the first contribution, used for ordering. */
  firstContributionAt: string;
  /**
   * ISO date the person agreed to be named on the page, after a one-line request on their
   * issue or PR. Null until then: the page only shows contributors who agreed.
   */
  consentedAt: string | null;
  contributions: Contribution[];
}

const REPO = "https://github.com/ironlam/poligraph";

export const CONTRIBUTORS: Contributor[] = [
  {
    handle: "DidiLJ",
    firstContributionAt: "2026-03-21",
    consentedAt: null,
    contributions: [
      {
        verb: "a proposé",
        label: "des tests unitaires (contraste des couleurs, dates extraites des URL)",
        url: `${REPO}/pull/278`,
        state: "repris par le mainteneur",
      },
      {
        verb: "a proposé",
        label: "des textes alternatifs pour les photos d'élus",
        url: `${REPO}/pull/280`,
        state: "repris par le mainteneur",
      },
    ],
  },
  {
    handle: "LaBinocle21",
    firstContributionAt: "2026-05-08",
    consentedAt: null,
    contributions: [
      {
        verb: "a proposé",
        label: "un point d'accès de l'API listant les votants d'un scrutin",
        url: `${REPO}/issues/328`,
        state: "à l'étude",
      },
    ],
  },
  {
    handle: "bazmap",
    firstContributionAt: "2026-07-21",
    consentedAt: null,
    contributions: [
      {
        verb: "a proposé",
        label: "les votes d'un parlementaire filtrés par thématique",
        url: `${REPO}/issues/478`,
        state: "à l'étude",
      },
    ],
  },
  {
    handle: "intelarti11",
    firstContributionAt: "2026-07-20",
    consentedAt: null,
    contributions: [
      {
        verb: "a contribué",
        label: "à la concordance des votes finaux des groupes",
        url: `${REPO}/pull/452`,
        state: "livré",
      },
      {
        verb: "a contribué",
        label: "aux données et à l'audit du soutien aux projets gouvernementaux",
        url: `${REPO}/pull/891`,
        state: "livré",
      },
    ],
  },
  {
    handle: "virginielenk-spec",
    firstContributionAt: "2026-10-04",
    consentedAt: null,
    contributions: [
      {
        verb: "a signalé",
        label:
          "que le taux de condamnation par parti ne distinguait pas les condamnations définitives",
        url: `${REPO}/issues/957`,
        state: "en cours de correction",
      },
    ],
  },
];

/** Contributors who agreed to be named, code first, then by first contribution. */
export function publishedContributors(list: Contributor[] = CONTRIBUTORS): Contributor[] {
  const hasCode = (c: Contributor) => c.contributions.some((x) => x.verb === "a contribué");
  return list
    .filter((c) => c.consentedAt !== null)
    .sort(
      (a, b) =>
        Number(hasCode(b)) - Number(hasCode(a)) ||
        a.firstContributionAt.localeCompare(b.firstContributionAt)
    );
}

/** Mentions, most recent first; undated ones last, in declaration order. */
export function sortedMentions(list: PressMention[] = PRESS_MENTIONS): PressMention[] {
  return [...list].sort((a, b) => {
    if (a.publishedAt && b.publishedAt) return b.publishedAt.localeCompare(a.publishedAt);
    if (a.publishedAt) return -1;
    if (b.publishedAt) return 1;
    return 0;
  });
}
