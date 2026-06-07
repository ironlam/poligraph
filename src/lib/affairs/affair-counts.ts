import type { AffairStatus, Involvement } from "@/generated/prisma";
import { AGGREGATE_STATUSES, CLOSE_STATUSES } from "@/config/judicial-maturity";
import { ADVERSE_INVOLVEMENTS } from "@/lib/affairs/public-filters";

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
 * DIRECT n'entre dans aucun (ni à charge, ni favorable).
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

type CountableAffair = { status: AffairStatus | string; involvement: Involvement | string };

export function computeAffairCounts(affairs: readonly CountableAffair[]): AffairCounts {
  let adverseAffairsCount = 0;
  let affairsMentionedCount = 0;
  let affairsVictimOrPlaintiffCount = 0;
  let favorableOutcomeCount = 0;

  for (const { status, involvement } of affairs) {
    const isAdverseInvolvement = ADVERSE_INVOLVEMENT_SET.has(involvement);
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
