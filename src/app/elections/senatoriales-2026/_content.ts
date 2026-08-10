/**
 * Editorial content for the Sénatoriales 2026 hub.
 *
 * Gathered in one module so the prose is reviewed as prose, once, instead of being
 * scattered across components. Per AGENTS.md §7 none of it is model-generated: every
 * figure below is either quoted from an identified source or computed from the
 * database at render time, and anything that is neither has been left out.
 *
 * Two numbers from the design mockup are deliberately absent. The count of municipal
 * councils elected in March 2026 (given as 34,875) is not in the sourced set and our
 * own data counts 34,754 communes with recorded elected councillors, a gap that
 * reflects import completeness rather than reality. And the 2020 to 2026 shift in
 * municipal political blocs is not computable at the granularity the mockup claims,
 * so it is not stated at all rather than stated loosely.
 */

import type { ElectionStatus } from "@/types";

/**
 * Where the ballot stands, reduced to what changes the wording.
 *
 * Derived from the phase the data layer resolves at read time, never from a date
 * compared in a component: two surfaces comparing the same date independently drift
 * apart the moment one of them is cached differently.
 */
export type BallotPhase = "before" | "polling-day" | "after";

export function getBallotPhase(status: ElectionStatus): BallotPhase {
  if (status === "ROUND_1" || status === "ROUND_2") return "polling-day";
  if (status === "BETWEEN_ROUNDS" || status === "COMPLETED") return "after";
  return "before";
}

export const SENATE_SEATS_TOTAL = 348;
export const SENATE_SEATS_AT_STAKE = 178;
export const SENATE_SEATS_OTHER_SERIES = SENATE_SEATS_TOTAL - SENATE_SEATS_AT_STAKE;

/**
 * "Série" carries the whole page and nothing on it defined the word.
 *
 * The hub says "Renouvellement de la série 2", badges a seat "Jusqu'en 2029", and explains
 * that a group's exposure follows the series of its seats. A reader who does not know what
 * a series is cannot use any of that. The definition therefore appears in the page itself,
 * not only in a tooltip: information behind a hover is unreachable on touch and by anyone
 * who does not know there is something to hover.
 *
 * Both figures are our own count, 348 = 178 + 170, not a quoted total.
 */
export const SERIES_EXPLAINER =
  "Le Sénat se renouvelle par moitié tous les trois ans. Chaque département appartient à " +
  "une série et à une seule : les 178 sièges de la série 2 sont remis en jeu cette année, " +
  "les 170 de la série 1 l'ont été en 2023 et le seront en 2029. La série d'un siège ne " +
  "dépend pas du sénateur qui l'occupe.";

/**
 * 64 constituencies, not 63 departments: the Sénat counts the 63 renewable
 * departments and collectivities plus the Français établis hors de France, who vote
 * separately. Saying "63 préfectures" drops that last constituency.
 */
export const CONSTITUENCY_COUNT = 64;

export const GRANDS_ELECTEURS_TOTAL = 93469;
export const MUNICIPAL_DELEGATE_SHARE = "95,2 %";

export const DECREE_LABEL = "Décret n° 2026-301 du 21 avril 2026";
export const DECREE_URL = "https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000053925339";
export const SENATE_OFFICIAL_URL = "https://senatoriales2026.senat.fr/";
export const ELECTORAL_CODE_URL =
  "https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006070239/LEGISCTA000006134760/";

/** Source labels, so the same body is never named two ways on one page. */
export const SOURCE_SENAT = { label: "Sénat", url: SENATE_OFFICIAL_URL };
export const SOURCE_DECREE = { label: DECREE_LABEL, url: DECREE_URL };
export const SOURCE_ELECTORAL_CODE = {
  label: "Code électoral, art. L. 280 à L. 293",
  url: ELECTORAL_CODE_URL,
};

// ─── The thesis ─────────────────────────────────────────────────────

export const HUB_TITLE = "Le Sénat se joue dans les conseils municipaux";
export const HUB_TITLE_PAST = "Le Sénat s'est joué dans les conseils municipaux";

export const HUB_LEDE =
  "Vous n'aurez pas de bulletin à mettre. 93 469 grands électeurs voteront à votre place, " +
  "et 95,2 % d'entre eux ont été désignés par les conseils municipaux que vous avez élus.";
export const HUB_LEDE_PAST =
  "Le scrutin a eu lieu. 93 469 grands électeurs ont voté à votre place, et 95,2 % d'entre eux " +
  "avaient été désignés par les conseils municipaux que vous avez élus.";

// ─── From your council to the Senate ────────────────────────────────

export interface BridgeStep {
  when: string;
  headline: string;
  detail: string;
}

export const BRIDGE_STEPS: BridgeStep[] = [
  {
    when: "15 et 22 mars 2026",
    headline: "Vous élisez votre conseil municipal",
    detail:
      "Toutes les communes votent au scrutin de liste paritaire, une première. C'est le seul " +
      "moment de la chaîne où vous déposez un bulletin.",
  },
  {
    when: "5 juin 2026",
    headline: "Les conseils désignent leurs délégués",
    detail:
      "93 469 grands électeurs, dont 95,2 % de délégués des conseils municipaux. Le nombre de " +
      "délégués d'une commune découle d'un barème, pas d'une négociation.",
  },
  {
    when: "27 septembre 2026",
    headline: "Les grands électeurs élisent les sénateurs",
    detail:
      "178 sièges sur 348, dans 64 circonscriptions : 63 départements et collectivités, plus " +
      "les Français établis hors de France. Le vote y est obligatoire.",
  },
  {
    when: "Jusqu'en 2032",
    headline: "Les sénateurs siègent six ans",
    detail:
      "Le Sénat ne peut pas être dissous. Un conseil municipal élu en mars 2026 pèse donc sur " +
      "la chambre haute jusqu'en 2032.",
  },
];

// ─── Voting rules ───────────────────────────────────────────────────

export interface ScrutinRule {
  seats: string;
  mode: string;
  detail: string;
}

export interface ScrutinRuleWithHours extends ScrutinRule {
  /** Opening and closing hours fixed by article 3 of the decree. */
  hours: string;
}

/**
 * The two modes and their hours.
 *
 * Hours quoted from article 3 of the decree, which writes them out: "le premier tour de
 * scrutin sera ouvert à huit heures trente et clos à onze heures. S'il y a lieu d'y
 * procéder, le second tour de scrutin sera ouvert à quinze heures trente et clos à
 * dix-sept heures trente" for the majority ballot, and "le scrutin sera ouvert à huit
 * heures trente et clos à dix-sept heures trente" for the proportional one.
 *
 * The design mockup closed the proportional ballot at 17 h. The decree says 17 h 30.
 */
export const SCRUTIN_RULES: ScrutinRuleWithHours[] = [
  {
    seats: "1 ou 2 sièges",
    mode: "Scrutin majoritaire",
    detail:
      "Deux tours dans la journée : majorité absolue au premier, majorité relative au second.",
    hours: "1er tour de 8 h 30 à 11 h, second tour s'il y a lieu de 15 h 30 à 17 h 30",
  },
  {
    seats: "3 sièges et plus",
    mode: "Proportionnelle de liste",
    detail: "Un seul tour, listes paritaires, répartition à la plus forte moyenne.",
    hours: "Scrutin de 8 h 30 à 17 h 30",
  },
];

/**
 * The hours above cover the 63 departments and collectivities. They are not extended to
 * the sixty-fourth constituency, and the wording says only what is verifiable today: the
 * 21 April decree convenes the listed departments and collectivities, so it fixes nothing
 * for the Français établis hors de France. It does not follow that no official hour will
 * exist. A dedicated text set 9 h to 15 h in 2023, the Sénat announces the same for 2026,
 * and France Diplomatie states its own arrangements are still to be published.
 *
 * Saying "the decree does not fix them" therefore survives that publication, where "no
 * hours are known" would have become false the day it appears.
 *
 * Six of the twelve seats belong to the renewed series, counted from our own senatorial
 * mandates rather than quoted.
 */
export const FEHF_SEATS_AT_STAKE = 6;
export const FEHF_NOTE =
  "Pour les Français établis hors de France, le scrutin relève d'un dispositif distinct. " +
  "Le décret du 21 avril 2026 ne fixe pas les horaires de ce collège, auquel reviennent " +
  "6 des 178 sièges renouvelés.";

// ─── État 2 : dépôt des candidatures ────────────────────────────────

/**
 * Article 2 of the decree: declarations are received from Monday 7 September 2026 to
 * Friday 11 September at 18 h, and for a second round until 15 h on polling day. That last
 * deadline is what makes the 15 h 30 opening possible, so it belongs here rather than being
 * dropped as a detail.
 *
 * Both hours are **local to the circonscription where the declaration is filed**, at the
 * services of the State's representative. The decree convenes territories from UTC+12 to
 * UTC-10, so neither hour is a national instant. Every phrasing below therefore describes
 * the period and locates the hour, and none of them asserts a to-the-minute status: "le
 * dépôt est clos" read in Paris would be false in Polynésie française for six more hours.
 */
export const CANDIDACY_WINDOW_LABEL =
  "du 7 au 11 septembre 2026, jusqu'à 18 h auprès des services du représentant de " +
  "l'État dans la circonscription concernée";
export const CANDIDACY_SECOND_ROUND_LABEL = "le jour du scrutin jusqu'à 15 h";

export const CANDIDACY_HEADING = "Le dépôt des candidatures";

export const CANDIDACY_LEDE: Record<
  "before" | "open" | "closed" | "unknown",
  { headline: string; body: string }
> = {
  before: {
    headline: "Le dépôt des candidatures n'est pas encore ouvert",
    body: "Les déclarations pour le premier tour seront reçues " + CANDIDACY_WINDOW_LABEL + ".",
  },
  open: {
    headline: "Le dépôt des candidatures est en cours",
    body: "Les déclarations pour le premier tour sont reçues " + CANDIDACY_WINDOW_LABEL + ".",
  },
  closed: {
    headline: "Le dépôt pour le premier tour est terminé",
    body:
      "En cas de second tour au scrutin majoritaire, de nouvelles déclarations peuvent " +
      "être déposées " +
      CANDIDACY_SECOND_ROUND_LABEL +
      ".",
  },
  unknown: {
    headline: "Période de dépôt non renseignée",
    body:
      "Les dates de dépôt ne sont pas enregistrées pour ce scrutin. Nous ne les déduisons " +
      "pas du calendrier.",
  },
};

/**
 * Once the ballot is behind us the deposit period is not merely over, it is spent.
 *
 * The `closed` copy above holds from 12 September onwards, including on polling day, but on
 * 28 September it still describes a second round as something that can receive
 * declarations. Same failure as the outgoing-composition block: nothing breaks, the page
 * simply starts asserting a thing that has stopped being true.
 */
export const CANDIDACY_LEDE_AFTER_BALLOT = {
  headline: "Le dépôt des candidatures est terminé",
  body:
    "Les déclarations pour le premier tour ont été reçues du 7 au 11 septembre 2026. Un " +
    "second tour au scrutin majoritaire pouvait recevoir de nouvelles déclarations le jour " +
    "du scrutin jusqu'à 15 h.",
};

/**
 * Why no candidate appears here, in any phase.
 *
 * Declarations are filed préfecture by préfecture. We hold no verified source listing
 * them constituency by constituency, so the block says that instead of showing a
 * partial list, and no counter of collected departments appears: a gauge reading "21 sur
 * 63" would turn our own collection progress into an apparent fact about the ballot.
 */
export const CANDIDACY_MISSING_TITLE = "Nous ne publions aucune liste de candidats";
export const CANDIDACY_MISSING_BODY =
  "Les déclarations sont déposées et publiées préfecture par préfecture. Nous ne disposons " +
  "d'aucune source vérifiée qui les recense circonscription par circonscription, et nous " +
  "préférons ne rien afficher plutôt qu'une liste incomplète dont rien n'indiquerait ce qui " +
  "manque.";

// ─── État 3 : le jour du scrutin ────────────────────────────────────

export const BALLOT_DAY_HEADING = "Le scrutin a lieu aujourd'hui";
export const BALLOT_DAY_LEDE =
  "Les grands électeurs votent dans les 63 départements et collectivités concernés, plus " +
  "le collège distinct des Français établis hors de France. Le vote y est obligatoire.";

/**
 * What this page will not do on the evening of the ballot.
 *
 * Stated explicitly rather than left as an absence, because the absence is the editorial
 * choice: no live count, no trend, no projection, nothing before the official
 * proclamation by the commission de recensement des votes.
 */
export const BALLOT_DAY_NO_RESULTS_TITLE = "Aucun résultat avant la proclamation";
export const BALLOT_DAY_NO_RESULTS_BODY =
  "Nous ne publions ni estimation, ni tendance, ni décompte en cours de journée. Les " +
  "sièges sont attribués par la proclamation officielle des résultats, et c'est elle que " +
  "nous attendons pour mettre à jour les mandats.";

// ─── Milestones ─────────────────────────────────────────────────────

export interface Milestone {
  label: string;
  when: string;
  note: string;
  /** Settled by a published act, as opposed to scheduled by usage. */
  confirmed: boolean;
}

/**
 * The generic `ElectionKeyDates` renders the `Election` model's date columns and maps
 * each label to a phase. Two milestones that matter here have no column (the 5 June
 * designation, the October election of the Senate president), so it would silently
 * drop them. Hence a dedicated list.
 */
export const MILESTONES: Milestone[] = [
  {
    label: "Décret de convocation",
    when: "21 avril 2026",
    note: "Décret n° 2026-301, publié au Journal officiel.",
    confirmed: true,
  },
  {
    label: "Désignation des délégués",
    when: "5 juin 2026",
    // The decree convened only the councils of the renewed departments, plus Guyane
    // and Polynésie française. Saying "les conseils municipaux" flat would credit a
    // designation to série-1 communes that never took part.
    note:
      "Les conseils municipaux des départements renouvelés élisent leurs délégués et leurs " +
      "suppléants.",
    confirmed: true,
  },
  {
    label: "Dépôt des candidatures",
    when: "7 au 11 septembre 2026",
    note: "En préfecture, jusqu'à 18 h le vendredi.",
    confirmed: true,
  },
  {
    label: "Scrutin",
    when: "dimanche 27 septembre 2026",
    note: "Dans les 64 circonscriptions concernées. Le vote est obligatoire pour les grands électeurs.",
    confirmed: true,
  },
  {
    label: "Élection du président du Sénat",
    when: "début octobre 2026",
    note: "Le Sénat renouvelé élit son président, son bureau et ses présidences de commission.",
    confirmed: false,
  },
];
