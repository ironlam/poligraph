import type { AffairStatus, Involvement, JurisdictionOrder } from "@/generated/prisma";
import { AGGREGATE_STATUSES, CLOSE_STATUSES } from "@/config/judicial-maturity";
import { ADVERSE_INVOLVEMENTS, ADVERSE_JURISDICTION_ORDER } from "@/lib/affairs/public-filters";

/**
 * Compteurs d'affaires par rôle, calculés en mémoire depuis les affaires
 * publiées déjà chargées (RGPD art. 10 : ne pas mélanger mis en cause,
 * mention et victime/plaignant dans un chiffre unique).
 *
 * Cohérent avec les where-builders publics (public-filters.ts) :
 * - adverse  = à charge (Tier 1+2), comme getAdverseAffairWhere()
 * - favorable = issues closes sans condamnation, comme getFavorableOutcomeWhere()
 *
 * Ces compteurs ne partitionnent pas le total : une enquête préliminaire
 * DIRECT n'entre dans aucun (ni à charge, ni favorable), et une procédure hors
 * de l'ordre pénal non plus. Une amende de la chambre du contentieux de la Cour
 * des comptes reste visible sur la fiche sans alimenter « mis en cause » ni
 * « issue favorable », que le lecteur comprendrait comme pénaux.
 */

export interface AffairCounts {
  adverseAffairsCount: number;
  affairsMentionedCount: number;
  affairsVictimOrPlaintiffCount: number;
  favorableOutcomeCount: number;
}

const ADVERSE_INVOLVEMENT_SET = new Set<string>(ADVERSE_INVOLVEMENTS);
const AGGREGATE_STATUS_SET = new Set<string>(AGGREGATE_STATUSES);
const CLOSE_STATUS_SET = new Set<string>(CLOSE_STATUSES);

type CountableAffair = {
  status: AffairStatus | string;
  involvement: Involvement | string;
  /** Obligatoire : optionnel, un oubli de select compterait du financier
   * comme du pénal sans qu'aucun test ni type ne le signale. */
  jurisdictionOrder: JurisdictionOrder | string;
};

export function computeAffairCounts(affairs: readonly CountableAffair[]): AffairCounts {
  let adverseAffairsCount = 0;
  let affairsMentionedCount = 0;
  let affairsVictimOrPlaintiffCount = 0;
  let favorableOutcomeCount = 0;

  for (const { status, involvement, jurisdictionOrder } of affairs) {
    // Absent, on suppose le pénal : la colonne a ce défaut, et un appelant qui
    // ne l'a pas encore sélectionnée décrit forcément des affaires pénales.
    const isPenal =
      (jurisdictionOrder ?? ADVERSE_JURISDICTION_ORDER) === ADVERSE_JURISDICTION_ORDER;
    const isAdverseInvolvement = isPenal && ADVERSE_INVOLVEMENT_SET.has(involvement);
    if (involvement === "MENTIONED_ONLY") affairsMentionedCount++;
    if (involvement === "VICTIM" || involvement === "PLAINTIFF") affairsVictimOrPlaintiffCount++;
    if (isAdverseInvolvement && AGGREGATE_STATUS_SET.has(status)) adverseAffairsCount++;
    if (isAdverseInvolvement && CLOSE_STATUS_SET.has(status)) favorableOutcomeCount++;
  }

  return {
    adverseAffairsCount,
    affairsMentionedCount,
    affairsVictimOrPlaintiffCount,
    favorableOutcomeCount,
  };
}
