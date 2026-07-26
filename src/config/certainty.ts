import type { AffairStatus, Involvement } from "@/generated/prisma";

export type CertaintyLevel = "ETABLI" | "PRONONCE" | "EN_COURS" | "CLOS_FAVORABLE";

/**
 * Whether a certainty/status badge describes the tracked politician themselves.
 *
 * An affair's `status` (and the certainty derived from it) describes the outcome
 * for the person prosecuted. Only DIRECT/INDIRECT make the tracked politician
 * that person; for PLAINTIFF, VICTIM or MENTIONED_ONLY the status refers to a
 * third party, so a charging certainty badge ("Condamnation définitive") would
 * misrepresent them (issue #383). Mirrors the guard in `AffairStatusNotice`.
 */
export function isAccusedInvolvement(involvement: Involvement): boolean {
  return involvement === "DIRECT" || involvement === "INDIRECT";
}

const STATUS_TO_CERTAINTY: Record<AffairStatus, CertaintyLevel> = {
  CONDAMNATION_DEFINITIVE: "ETABLI",
  CONDAMNATION_PREMIERE_INSTANCE: "PRONONCE",
  APPEL_EN_COURS: "PRONONCE",
  POURVOI_EN_CASSATION: "PRONONCE",
  ENQUETE_PRELIMINAIRE: "EN_COURS",
  INSTRUCTION: "EN_COURS",
  MISE_EN_EXAMEN: "EN_COURS",
  RENVOI_TRIBUNAL: "EN_COURS",
  PROCES_EN_COURS: "EN_COURS",
  RELAXE: "CLOS_FAVORABLE",
  ACQUITTEMENT: "CLOS_FAVORABLE",
  NON_LIEU: "CLOS_FAVORABLE",
  PRESCRIPTION: "CLOS_FAVORABLE",
  CLASSEMENT_SANS_SUITE: "CLOS_FAVORABLE",
};

export function getCertaintyLevel(status: AffairStatus): CertaintyLevel {
  return STATUS_TO_CERTAINTY[status];
}

export function isActiveCertainty(level: CertaintyLevel): boolean {
  return level !== "CLOS_FAVORABLE";
}

export const CERTAINTY_LABELS: Record<CertaintyLevel, string> = {
  ETABLI: "Condamnation définitive",
  PRONONCE: "Condamnation non définitive",
  EN_COURS: "Procédure en cours",
  CLOS_FAVORABLE: "Procédure close sans condamnation",
};

export const CERTAINTY_COLORS: Record<CertaintyLevel, string> = {
  ETABLI: "text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/40",
  PRONONCE: "text-orange-700 bg-orange-100 dark:text-orange-300 dark:bg-orange-900/40",
  EN_COURS: "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40",
  CLOS_FAVORABLE: "text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-800",
};

export const CERTAINTY_SORT_ORDER: Record<CertaintyLevel, number> = {
  ETABLI: 0,
  PRONONCE: 1,
  EN_COURS: 2,
  CLOS_FAVORABLE: 3,
};

export const CERTAINTY_DESCRIPTIONS: Record<CertaintyLevel, string> = {
  ETABLI: "Culpabilité établie par décision définitive, voies de recours épuisées.",
  PRONONCE:
    "Verdict rendu en première instance, appel possible ou en cours. La présomption d'innocence s'applique.",
  EN_COURS:
    "Procédure judiciaire active. Aucun jugement n'a été rendu. La présomption d'innocence s'applique.",
  CLOS_FAVORABLE:
    "Procédure terminée sans condamnation (relaxe, acquittement, non-lieu, prescription ou classement sans suite).",
};

export const CERTAINTY_SCORE: Record<CertaintyLevel, number> = {
  ETABLI: 4,
  PRONONCE: 3,
  EN_COURS: 2,
  CLOS_FAVORABLE: 0,
};

/** Get all AffairStatus values for a given certainty level */
export function getStatusesForCertainty(level: CertaintyLevel): AffairStatus[] {
  return Object.entries(STATUS_TO_CERTAINTY)
    .filter(([, l]) => l === level)
    .map(([status]) => status as AffairStatus);
}

/** All AffairStatus values that are NOT clos favorable (for DB where clauses) */
export const ACTIVE_AFFAIR_STATUSES: AffairStatus[] = Object.entries(STATUS_TO_CERTAINTY)
  .filter(([, level]) => level !== "CLOS_FAVORABLE")
  .map(([status]) => status as AffairStatus);

/** All AffairStatus values that are clos favorable */
export const CLOS_FAVORABLE_STATUSES: AffairStatus[] = Object.entries(STATUS_TO_CERTAINTY)
  .filter(([, level]) => level === "CLOS_FAVORABLE")
  .map(([status]) => status as AffairStatus);
