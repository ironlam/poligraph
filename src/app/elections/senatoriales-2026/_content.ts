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

export const SCRUTIN_RULES: ScrutinRule[] = [
  {
    seats: "1 ou 2 sièges",
    mode: "Scrutin majoritaire",
    detail:
      "Deux tours dans la journée : majorité absolue au premier, majorité relative au second.",
  },
  {
    seats: "3 sièges et plus",
    mode: "Proportionnelle de liste",
    detail: "Un seul tour, listes paritaires, répartition à la plus forte moyenne.",
  },
];

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
