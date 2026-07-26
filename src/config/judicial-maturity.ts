import type { AffairStatus } from "@/generated/prisma";

export type JudicialMaturity =
  | "CONDAMNATION"
  | "PROCEDURE_VALIDEE"
  | "ENQUETE"
  | "CLOSE_SANS_CONDAMNATION";

const STATUS_TO_MATURITY: Record<AffairStatus, JudicialMaturity> = {
  // Tier 1: Condamnation (judicially established)
  CONDAMNATION_DEFINITIVE: "CONDAMNATION",
  CONDAMNATION_PREMIERE_INSTANCE: "CONDAMNATION",
  APPEL_EN_COURS: "CONDAMNATION",
  POURVOI_EN_CASSATION: "CONDAMNATION",
  // Tier 2: Procedure validee (judge-validated, pre-verdict)
  MISE_EN_EXAMEN: "PROCEDURE_VALIDEE",
  INSTRUCTION: "PROCEDURE_VALIDEE",
  RENVOI_TRIBUNAL: "PROCEDURE_VALIDEE",
  PROCES_EN_COURS: "PROCEDURE_VALIDEE",
  // Tier 3: Enquete (complaint-stage, no judicial validation)
  ENQUETE_PRELIMINAIRE: "ENQUETE",
  // Tier 4: Close sans condamnation
  RELAXE: "CLOSE_SANS_CONDAMNATION",
  ACQUITTEMENT: "CLOSE_SANS_CONDAMNATION",
  NON_LIEU: "CLOSE_SANS_CONDAMNATION",
  PRESCRIPTION: "CLOSE_SANS_CONDAMNATION",
  CLASSEMENT_SANS_SUITE: "CLOSE_SANS_CONDAMNATION",
};

/** Classify an AffairStatus into its judicial maturity tier. */
export function getJudicialMaturity(status: AffairStatus): JudicialMaturity {
  return STATUS_TO_MATURITY[status];
}

/**
 * Returns true for Tier 1 + 2 (condamnation + procedure validee).
 * These are affairs where a judge has validated the case.
 * Used to filter what counts in aggregate metrics.
 */
export function isJudiciallyValidated(status: AffairStatus): boolean {
  const tier = STATUS_TO_MATURITY[status];
  return tier === "CONDAMNATION" || tier === "PROCEDURE_VALIDEE";
}

export const MATURITY_LABELS: Record<JudicialMaturity, string> = {
  CONDAMNATION: "Condamnation",
  PROCEDURE_VALIDEE: "Procédure validée par un juge",
  ENQUETE: "Enquête préliminaire",
  CLOSE_SANS_CONDAMNATION: "Procédure close sans condamnation",
};

/** Statuses that pass the judicial validation threshold (Tier 1 + 2).
 *  Use in Prisma: `where: { status: { in: AGGREGATE_STATUSES } }` */
export const AGGREGATE_STATUSES: AffairStatus[] = Object.entries(STATUS_TO_MATURITY)
  .filter(([, tier]) => tier === "CONDAMNATION" || tier === "PROCEDURE_VALIDEE")
  .map(([status]) => status as AffairStatus);

/** Tier 1 only - condamnation statuses */
export const CONDAMNATION_STATUSES: AffairStatus[] = Object.entries(STATUS_TO_MATURITY)
  .filter(([, tier]) => tier === "CONDAMNATION")
  .map(([status]) => status as AffairStatus);

/** Tier 2 only - procédures validées par un juge, hors enquête préliminaire.
 *  À utiliser pour tout compteur présenté comme « mis en cause » ou
 *  « validé par un juge ». */
export const PROCEDURE_VALIDEE_STATUSES: AffairStatus[] = Object.entries(STATUS_TO_MATURITY)
  .filter(([, tier]) => tier === "PROCEDURE_VALIDEE")
  .map(([status]) => status as AffairStatus);

/** Tier 2 + 3 - procedures en cours (for display: groups validated + enquete) */
export const EN_COURS_STATUSES: AffairStatus[] = Object.entries(STATUS_TO_MATURITY)
  .filter(([, tier]) => tier === "PROCEDURE_VALIDEE" || tier === "ENQUETE")
  .map(([status]) => status as AffairStatus);

/** Tier 4 - close sans condamnation statuses */
export const CLOSE_STATUSES: AffairStatus[] = Object.entries(STATUS_TO_MATURITY)
  .filter(([, tier]) => tier === "CLOSE_SANS_CONDAMNATION")
  .map(([status]) => status as AffairStatus);
