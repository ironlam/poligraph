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

import { FEHF_REGIME } from "@/config/senatoriales";
import {
  SENATE_STATUTORY_SEATS_BY_SERIES,
  SENATE_STATUTORY_SEATS_TOTAL,
} from "@/config/senate-seats";
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

export const SENATE_SEATS_TOTAL = SENATE_STATUTORY_SEATS_TOTAL;
export const SENATE_SEATS_AT_STAKE = SENATE_STATUTORY_SEATS_BY_SERIES[2];
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
 * The figures are statutory, not a count of our rows: tableau n° 5 annexé au code électoral
 * gives série 1 at 170 and série 2 at 178. Our own data reproduces the same split, which is a
 * check on the import, not the source of the claim, and `SOURCE_TABLEAU_5` is cited wherever
 * the numbers appear.
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

/**
 * Separate source entry, because `SOURCE_ELECTORAL_CODE` covers L. 280 to L. 293 and the
 * early-closing rule is a regulatory article outside that range. Citing the L range under a
 * claim drawn from R. 168 would show a source that does not carry it.
 */
export const SOURCE_R168 = {
  label: "Code électoral, art. R. 168",
  url: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000042535572",
};

/**
 * Mode de scrutin, L. 294 to L. 295, also outside the L. 280 to L. 293 range.
 *
 * `ScrutinRules` describes the majority and proportional systems, which live here, while
 * citing only the collège section. The thresholds it states are L. 294's, so the source
 * shown under them has to be L. 294's too.
 */
export const SOURCE_SCRUTIN_MODE = {
  label: "Code électoral, art. L. 294 à L. 295",
  url: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000027804524",
};

/**
 * The table that actually establishes every seat figure this page displays.
 *
 * Tableau n° 5 annexé au code électoral, "Répartition des sièges de sénateurs entre les
 * séries", version in force since 31 March 2011, gives série 1 at **170**, série 2 at **178**
 * and the Français établis hors de France at **6 seats in each série**. One primary source
 * carries the three numbers, so they no longer rest on a comment explaining their provenance
 * while the rendered source line pointed at texts that do not state them.
 */
export const SOURCE_TABLEAU_5 = {
  label: "Code électoral, tableau n° 5 annexé",
  url: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000023260785",
};

/** Individual statutory seat count for each department. */
export const SOURCE_TABLEAU_6 = {
  label: "Code électoral, tableau n° 6 annexé",
  url: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006354327",
};

/** Mayotte's individual count and series, which neither table gives separately. */
export const SOURCE_MAYOTTE_SEATS = {
  label: "Code électoral, art. LO473 et L474",
  url: "https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006070239/LEGISCTA000006148536",
};

/**
 * The two standing texts governing the Français établis hors de France.
 *
 * Décret n° 2026-301 does not convene that college, so its articles cannot be cited for
 * anything about it. These can, and both are in force.
 */
export const SOURCE_FEHF_CANDIDACY = {
  label: "Loi n° 2013-659, art. 46",
  url: "https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000027736547",
};
export const SOURCE_FEHF_POLL = {
  label: "Décret n° 2014-290, art. 50",
  url: "https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000028685555",
};

// ─── The thesis ─────────────────────────────────────────────────────

export const HUB_TITLE = "Des municipales au renouvellement du Sénat";
export const HUB_TITLE_PAST = "La composition du Sénat s'est jouée dans les conseils municipaux";

export const HUB_LEDE =
  "Vous ne voterez pas directement aux élections sénatoriales. Le 27 septembre 2026, " +
  "93 469 grands électeurs sont appelés à renouveler les 178 sièges de la série 2. Parmi eux, " +
  "88 937, soit 95,2 %, sont des délégués des conseils municipaux.";
export const HUB_LEDE_PAST =
  "Le renouvellement des 178 sièges de la série 2 concernait 93 469 grands électeurs. " +
  "Parmi eux, 88 937, soit 95,2 %, étaient des délégués des conseils municipaux.";

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
    when: "Selon la série",
    headline: "Les délégués municipaux sont désignés",
    detail:
      "Pour la série 2, cette étape a eu lieu le 5 juin 2026. Pour la série 1, elle aura lieu " +
      "lors du renouvellement de 2029.",
  },
  {
    when: "2026 ou 2029",
    headline: "Les grands électeurs élisent les sénateurs",
    detail:
      "Le 27 septembre 2026, 178 sièges de la série 2 sont renouvelés. Les départements de " +
      "série 1 seront concernés en 2029.",
  },
  {
    when: "Mandat de six ans",
    headline: "Les sénateurs siègent six ans",
    detail:
      "Les sénateurs de série 2 élus en 2026 siègent jusqu'en 2032. Ceux de série 1 élus en " +
      "2029 siègent jusqu'en 2035.",
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
 *
 * These are the hours the decree fixes, and article 3 applies the same ones to Guyane,
 * Polynésie française, Saint-Barthélemy, Saint-Martin and Wallis-et-Futuna as to the other
 * majority-ballot departments. Since those territories span UTC+12 to UTC-10, a single
 * uniform pair of hours can only be read as local hours, which is the same reading the
 * candidacy period rests on.
 *
 * They are also **upper bounds, not guaranteed hours**: see `POLL_EARLY_CLOSE_NOTE`.
 */
export const SCRUTIN_RULES: ScrutinRuleWithHours[] = [
  {
    seats: "1 ou 2 sièges",
    mode: "Scrutin majoritaire",
    // L. 294 pose DEUX conditions cumulatives au premier tour, pas une. Le texte antérieur
    // ne citait que la majorité absolue, ce qui présentait une condition nécessaire comme
    // suffisante : un lecteur en concluait qu'une majorité absolue élit au premier tour.
    detail:
      "Deux tours dans la journée. Au premier il faut à la fois la majorité absolue des " +
      "suffrages exprimés et un nombre de voix égal au quart des électeurs inscrits ; au " +
      "second, la majorité relative suffit.",
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
 * The closing hours are maximums, and saying only "clos à 17 h 30" invites a reader to
 * believe a grand électeur may turn up at 17 h.
 *
 * Article R. 168, third paragraph, in force since 20 November 2020: "Dans les deux cas, si
 * le président du bureau du collège électoral constate que dans toutes les sections de vote
 * tous les électeurs ont pris part au vote, il peut déclarer le scrutin clos avant les
 * heures fixées ci-dessus." The decree's article 3 refers to it explicitly.
 *
 * This is not a marginal case. Voting is compulsory for senatorial electors (article
 * L. 318, a 100 euro fine for unjustified abstention) and a college runs from a few hundred
 * to a few thousand electors, so every elector having voted before the closing hour is
 * ordinary rather than exceptional.
 */
export const POLL_EARLY_CLOSE_NOTE =
  "Ces heures sont des bornes, pas des horaires garantis : dès que tous les électeurs ont " +
  "voté dans toutes les sections, le président du collège peut déclarer le scrutin clos " +
  "plus tôt.";

/**
 * The hours above cover the 63 departments and collectivities. They are not extended to
 * the sixty-fourth constituency, and the wording says only what is verifiable today: the
 * 21 April decree convenes the listed departments and collectivities, so it fixes nothing
 * for the Français établis hors de France. It does not follow that no official hour will
 * exist. A dedicated text set 9 h to 15 h in 2023, the Sénat announces the same for 2026,
 * and France Diplomatie states its own arrangements are still to be published.
 *
 * Saying only "the 21 April decree does not fix them" was true and concealed a rule that is
 * published and in force. Article 50 of décret n° 2014-290 of 4 March 2014 fixes 9 h to 15 h
 * for this college, with the same early-closing faculty. Stating the real hours with their
 * own source is both more useful and more honest than reporting an absence that is not one.
 *
 * The six seats are statutory, not a count of our rows: tableau n° 5 annexé au code électoral
 * lists "Français établis hors de France" with 6 seats in each série. Our own data holds six
 * série-2 mandates with a null `departmentCode`, which confirms the import; it is not the
 * source, and a count would publish five the day a seat fell vacant. `SOURCE_TABLEAU_5` is
 * cited under the note, because article 50 establishes the hours and says nothing about how
 * many seats are renewed.
 */
export const FEHF_SEATS_AT_STAKE = FEHF_REGIME.seatsAtStake;
export const FEHF_NOTE =
  "Les Français établis hors de France relèvent d'un dispositif distinct, que le décret du " +
  "21 avril 2026 ne convoque pas. Leur collège élit 6 des 178 sièges renouvelés, et son " +
  "scrutin est ouvert " +
  FEHF_REGIME.pollHours +
  ", avec la même possibilité de clôture anticipée une fois que tous ses membres ont voté.";

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
 *
 * The period is also **scoped to the 63 circonscriptions the decree convenes**. Article 1
 * does not convene the Français établis hors de France, so applying 7 to 11 September to all
 * 64 would attribute to that college a period that is not theirs: their declarations go to
 * the ministère des Affaires étrangères by the third Monday before the ballot, which is
 * Monday 7 September, the very day the general period opens. See `CANDIDACY_FEHF_NOTE`.
 */
export const CANDIDACY_WINDOW_LABEL =
  "du 7 au 11 septembre 2026, jusqu'à 18 h auprès des services du représentant de " +
  "l'État dans la circonscription concernée";
/**
 * The 15 h is as local as the 18 h. The "before" and "open" wordings locate their hour at
 * the services of the State's representative; this one carried no location at all, so a
 * reader in Paris could read it as 15 h Paris. Qualified explicitly rather than repeating
 * the long formula a second time in the same block.
 */
export const CANDIDACY_SECOND_ROUND_LABEL =
  "le jour du scrutin jusqu'à 15 h, heure locale de la circonscription";

export const CANDIDACY_HEADING = "Le dépôt des candidatures";

export const CANDIDACY_LEDE: Record<
  "before" | "open" | "closed" | "unknown",
  { headline: string; body: string }
> = {
  before: {
    headline: "Le dépôt des candidatures n'est pas encore ouvert",
    body:
      "Dans les 63 départements et collectivités convoqués par le décret, les déclarations " +
      "pour le premier tour seront reçues " +
      CANDIDACY_WINDOW_LABEL +
      ".",
  },
  open: {
    headline: "Le dépôt des candidatures est en cours",
    body:
      "Dans les 63 départements et collectivités convoqués par le décret, les déclarations " +
      "pour le premier tour sont reçues " +
      CANDIDACY_WINDOW_LABEL +
      ".",
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
 * The sixty-fourth circonscription files somewhere else, on another date, by another text.
 *
 * Article 46 of loi n° 2013-659: "Les déclarations de candidature sont déposées au ministère
 * des affaires étrangères au plus tard le troisième lundi qui précède le scrutin, à
 * 18 heures." Third Monday before Sunday 27 September 2026 is Monday 7 September.
 *
 * Two things worth stating plainly. That deadline falls on the day the general period opens,
 * so the two regimes barely overlap. And it really is a single instant, because there is one
 * filing place: 18 h at the ministère is 18 h in Paris, with none of the locality that makes
 * the other 63 impossible to reduce to one moment.
 */
export const CANDIDACY_FEHF_NOTE =
  "Les Français établis hors de France ne sont pas convoqués par ce décret et suivent leur " +
  "propre régime : les candidatures se déposent " +
  FEHF_REGIME.candidacyPlace +
  ", au plus tard " +
  FEHF_REGIME.candidacyDeadlineLabel +
  ", soit le troisième lundi précédant le scrutin.";

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
    "du scrutin jusqu'à 15 h, heure locale de la circonscription.",
};

/**
 * Why no candidate appears here, in any phase.
 *
 * Declarations are filed circonscription by circonscription, and not all at a préfecture:
 * the earlier wording said "préfecture par préfecture", which is wrong for the collectivities
 * that have a haut-commissariat and wrong for the sixty-fourth, which files at the ministère.
 * "Circonscription par circonscription" covers all of them.
 *
 * We hold no verified source listing them, so the block says that instead of showing a
 * partial list, and no counter of collected departments appears: a gauge reading "21 sur
 * 63" would turn our own collection progress into an apparent fact about the ballot.
 */
export const CANDIDACY_MISSING_TITLE = "Nous ne publions aucune liste de candidats";
export const CANDIDACY_MISSING_BODY =
  "Les déclarations sont reçues et publiées circonscription par circonscription, chacune par " +
  "les services qui les enregistrent. Nous ne disposons d'aucune source vérifiée qui les " +
  "recense toutes, et nous préférons ne rien afficher plutôt qu'une liste incomplète dont " +
  "rien n'indiquerait ce qui manque.";

// ─── État 3 : le jour du scrutin ────────────────────────────────────

/**
 * No reader-relative term at all.
 *
 * "Aujourd'hui" was computed on the Paris calendar, so it was false for a reader whose local
 * day was still the 26th in Polynésie française (UTC-10) or already the 28th in
 * Wallis-et-Futuna (UTC+12). Adding the date beside it made the contradiction visible without
 * making the word true, and a visible contradiction is still a false statement.
 *
 * "Ce dimanche 27 septembre" keeps the immediacy and the Paris-side temporal guard that
 * decides when the block appears, while publishing only a date that every territory observes.
 */
export const BALLOT_DAY_HEADING = "Le scrutin a lieu ce dimanche 27 septembre";
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
