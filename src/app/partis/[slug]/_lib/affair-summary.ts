import {
  ADVERSE_JURISDICTION_ORDER,
  getAttributedCertaintyLevel,
  CERTAINTY_SORT_ORDER,
  type CertaintyLevel,
} from "@/config/certainty";
import type { AffairStatus } from "@/types";
import type { Involvement, JurisdictionOrder } from "@/generated/prisma";
import { summarizePartyCounts, type PartyCounts } from "@/lib/affairs/party-counts";

/**
 * Counting a party's judicial record.
 *
 * Extracted from an inline IIFE inside a 767-line page component, because this is the part that
 * carries a legal obligation rather than a layout: the counts must never present a member who was
 * the *victim* of an offence as one of the party's convictions (#383). That rule is worth a test,
 * and it could not have one while it lived inside the JSX.
 */

/** The minimum an affair must expose to be counted. */
export interface CountableAffair {
  status: string;
  involvement: Involvement;
  jurisdictionOrder: JurisdictionOrder;
}

/** Les quatre compteurs sont ceux de la liste /partis (`summarizePartyCounts`). */
export interface PartyAffairSummary<T extends CountableAffair> extends PartyCounts {
  /** Affaires pénales où le membre est la personne mise en cause. */
  direct: Array<T & { certainty: CertaintyLevel }>;
}

export function summarizePartyAffairs<T extends CountableAffair>(
  affairs: readonly T[]
): PartyAffairSummary<T> {
  const direct = affairs.flatMap((affair) => {
    if (affair.jurisdictionOrder !== ADVERSE_JURISDICTION_ORDER) return [];
    const certainty = getAttributedCertaintyLevel({
      involvement: affair.involvement,
      status: affair.status as AffairStatus,
    });
    return certainty === null ? [] : [{ ...affair, certainty }];
  });

  // Mêmes compteurs que la liste : une enquête préliminaire ou une instruction close sans mise
  // en examen reste dans `direct` (et dans la liste des affaires) sans entrer dans aucun total.
  return {
    direct,
    ...summarizePartyCounts(
      affairs.map((affair) => ({ ...affair, status: affair.status as AffairStatus }))
    ),
  };
}

/** Most certain first, so the card leads with what is established rather than what is alleged. */
export function byCertainty<T extends { certainty: CertaintyLevel }>(affairs: readonly T[]): T[] {
  return [...affairs].sort(
    (a, b) => CERTAINTY_SORT_ORDER[a.certainty] - CERTAINTY_SORT_ORDER[b.certainty]
  );
}

export function countByCertainty<T extends { certainty: CertaintyLevel }>(
  affairs: readonly T[],
  level: CertaintyLevel
): number {
  return affairs.filter((affair) => affair.certainty === level).length;
}
