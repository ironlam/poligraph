import type { AffairStatus, Involvement } from "@/generated/prisma";
import { getJudicialMaturity, isJudiciallyValidated } from "@/config/judicial-maturity";

export type AffairInput = { involvement: Involvement; status: AffairStatus };

export type JudicialCounts = {
  condamnationsDefinitives: number;
  condamnationsNonDefinitives: number;
  proceduresEnCours: number;
  victimeOuPlaignant: number;
  mentionneOuSecondaire: number;
  /** DIRECT + judicially validated (Tier 1+2). Feeds the Affaires tab badge. */
  badgeCount: number;
};

const NON_DEFINITIVE: ReadonlySet<AffairStatus> = new Set<AffairStatus>([
  "CONDAMNATION_PREMIERE_INSTANCE",
  "APPEL_EN_COURS",
  "POURVOI_EN_CASSATION",
]);

// "Mis en cause" scope for judicial counters: DIRECT only. This removes the
// prior double-count (INDIRECT was counted both as conviction/procedure and as
// a mention) and never labels a witness/secondary as convicted. Enquêtes
// préliminaires are excluded from all counters (RGPD art. 10 invariant).
export function computeJudicialCounts(affairs: AffairInput[]): JudicialCounts {
  const direct = affairs.filter((x) => x.involvement === "DIRECT");
  return {
    condamnationsDefinitives: direct.filter((x) => x.status === "CONDAMNATION_DEFINITIVE").length,
    condamnationsNonDefinitives: direct.filter((x) => NON_DEFINITIVE.has(x.status)).length,
    proceduresEnCours: direct.filter((x) => getJudicialMaturity(x.status) === "PROCEDURE_VALIDEE")
      .length,
    victimeOuPlaignant: affairs.filter(
      (x) => x.involvement === "VICTIM" || x.involvement === "PLAINTIFF"
    ).length,
    mentionneOuSecondaire: affairs.filter(
      (x) => x.involvement === "INDIRECT" || x.involvement === "MENTIONED_ONLY"
    ).length,
    badgeCount: direct.filter((x) => isJudiciallyValidated(x.status)).length,
  };
}
