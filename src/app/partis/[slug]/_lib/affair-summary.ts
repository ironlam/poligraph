import {
  getCertaintyLevel,
  isAccusedInvolvement,
  CERTAINTY_SORT_ORDER,
  type CertaintyLevel,
} from "@/config/certainty";
import { getJudicialMaturity } from "@/config/judicial-maturity";
import type { AffairStatus } from "@/types";
import type { Involvement } from "@/generated/prisma";

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
}

export interface PartyAffairSummary<T extends CountableAffair> {
  /** Affairs where the member is the accused. Everything below counts only these. */
  direct: Array<T & { certainty: CertaintyLevel }>;
  condamnations: number;
  enCours: number;
  closesSansCondamnation: number;
}

export function summarizePartyAffairs<T extends CountableAffair>(
  affairs: readonly T[]
): PartyAffairSummary<T> {
  const direct = affairs
    .filter((affair) => isAccusedInvolvement(affair.involvement))
    .map((affair) => ({ ...affair, certainty: getCertaintyLevel(affair.status as AffairStatus) }));

  const maturities = direct.map((affair) => getJudicialMaturity(affair.status as AffairStatus));

  return {
    direct,
    condamnations: maturities.filter((m) => m === "CONDAMNATION").length,
    enCours: maturities.filter((m) => m === "PROCEDURE_VALIDEE" || m === "ENQUETE").length,
    closesSansCondamnation: maturities.filter((m) => m === "CLOSE_SANS_CONDAMNATION").length,
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
