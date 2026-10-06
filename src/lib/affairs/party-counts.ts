import type { AffairStatus, Involvement, JurisdictionOrder } from "@/generated/prisma";
import { ADVERSE_JURISDICTION_ORDER, isAccusedInvolvement } from "@/config/certainty";
import {
  CLOSE_STATUSES,
  DEFINITIVE_CONVICTION_STATUSES,
  NON_DEFINITIVE_CONVICTION_STATUSES,
  PROCEDURE_VALIDEE_STATUSES,
} from "@/config/judicial-maturity";
import { isCountedInAdverseAggregates } from "@/lib/affairs/public-filters";

export interface PartyCountableAffair {
  status: AffairStatus;
  involvement: Involvement;
  jurisdictionOrder: JurisdictionOrder;
}

export interface PartyCounts {
  condamnationsDefinitives: number;
  condamnationsNonDefinitives: number;
  enCours: number;
  closesSansCondamnation: number;
}

/**
 * Les quatre compteurs d'un parti, partagés par la liste /partis et la carte de détail.
 * Condamnations et procédures : agrégat à charge (DIRECT, pénal), jamais l'enquête préliminaire.
 * Closes sans condamnation : même périmètre DIRECT et pénal, statuts d'issue favorable.
 */
export function summarizePartyCounts(affairs: readonly PartyCountableAffair[]): PartyCounts {
  const adverse = affairs.filter(isCountedInAdverseAggregates);
  const withStatus = (statuses: readonly AffairStatus[]) =>
    adverse.filter((affair) => statuses.includes(affair.status)).length;

  return {
    condamnationsDefinitives: withStatus(DEFINITIVE_CONVICTION_STATUSES),
    condamnationsNonDefinitives: withStatus(NON_DEFINITIVE_CONVICTION_STATUSES),
    enCours: withStatus(PROCEDURE_VALIDEE_STATUSES),
    closesSansCondamnation: affairs.filter(
      (affair) =>
        isAccusedInvolvement(affair.involvement) &&
        affair.jurisdictionOrder === ADVERSE_JURISDICTION_ORDER &&
        CLOSE_STATUSES.includes(affair.status)
    ).length,
  };
}
