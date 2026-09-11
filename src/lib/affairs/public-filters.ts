import { Prisma } from "@/generated/prisma";
import {
  AGGREGATE_STATUSES,
  CONDAMNATION_STATUSES,
  PROCEDURE_VALIDEE_STATUSES,
  CLOSE_STATUSES,
} from "@/config/judicial-maturity";

/**
 * Where-builders centralisés pour toute surface publique exposant ou
 * comptant des affaires judiciaires (RGPD article 10, invariant I4).
 *
 * Règles :
 * - tout agrégat filtre PUBLISHED ;
 * - un agrégat à charge ne contient jamais ENQUETE_PRELIMINAIRE, ni une issue
 *   favorable (RELAXE, ACQUITTEMENT, NON_LIEU, CLASSEMENT_SANS_SUITE,
 *   PRESCRIPTION), ni MENTIONED_ONLY/VICTIM/PLAINTIFF ;
 * - « condamnés » n'utilise que les statuts de condamnation ;
 * - « mis en cause » n'utilise que le Tier 2 (procédures validées par un
 *   juge), jamais l'enquête préliminaire ;
 * - tout agrégat à charge se limite à l'ordre PÉNAL. Une amende infligée par la
 *   chambre du contentieux de la Cour des comptes est une vraie sanction, mais
 *   « condamné » sans qualificatif se lit comme pénal : l'affaire figure sur la
 *   fiche, elle n'entre pas dans les totaux.
 */

/** Seul ordre de juridiction compté dans les agrégats à charge. */
export const ADVERSE_JURISDICTION_ORDER = "PENAL" as const;

/** Involvements comptés dans les agrégats à charge. */
export const ADVERSE_INVOLVEMENTS = ["DIRECT", "INDIRECT"] as const;

export const PUBLIC_AFFAIR_PUBLICATION_STATUS = "PUBLISHED" as const;

export function getPublishedAffairWhere(): Prisma.AffairWhereInput {
  return { publicationStatus: PUBLIC_AFFAIR_PUBLICATION_STATUS };
}

/** SQL equivalent of getPublishedAffairWhere(), restricted to reviewed aliases. */
export function getPublishedAffairSqlWhere(alias: "a" = "a"): Prisma.Sql {
  if (alias !== "a") {
    throw new Error(`Unsupported public affair SQL alias: ${alias}`);
  }

  return Prisma.sql`a."publicationStatus" = ${PUBLIC_AFFAIR_PUBLICATION_STATUS}`;
}

/** Affaires à charge : condamnations + procédures validées par un juge. */
export function getAdverseAffairWhere(): Prisma.AffairWhereInput {
  return {
    publicationStatus: PUBLIC_AFFAIR_PUBLICATION_STATUS,
    involvement: { in: [...ADVERSE_INVOLVEMENTS] },
    jurisdictionOrder: ADVERSE_JURISDICTION_ORDER,
    status: { in: AGGREGATE_STATUSES },
  };
}

/** Condamnations uniquement (Tier 1). */
export function getConvictionOnlyWhere(): Prisma.AffairWhereInput {
  return {
    publicationStatus: PUBLIC_AFFAIR_PUBLICATION_STATUS,
    involvement: { in: [...ADVERSE_INVOLVEMENTS] },
    jurisdictionOrder: ADVERSE_JURISDICTION_ORDER,
    status: { in: CONDAMNATION_STATUSES },
  };
}

/** Mis en cause : procédures validées par un juge (Tier 2 strict). */
export function getMisEnCauseWhere(): Prisma.AffairWhereInput {
  return {
    publicationStatus: PUBLIC_AFFAIR_PUBLICATION_STATUS,
    involvement: { in: [...ADVERSE_INVOLVEMENTS] },
    jurisdictionOrder: ADVERSE_JURISDICTION_ORDER,
    status: { in: PROCEDURE_VALIDEE_STATUSES },
  };
}

/**
 * Procédures closes sans condamnation (issues favorables, prescription incluse).
 *
 * Garde le filtre DIRECT/INDIRECT : ce compteur recense les procédures
 * concernant une personne mise en cause, pas les cas où elle est victime
 * ou plaignante.
 */
export function getFavorableOutcomeWhere(): Prisma.AffairWhereInput {
  return {
    publicationStatus: PUBLIC_AFFAIR_PUBLICATION_STATUS,
    involvement: { in: [...ADVERSE_INVOLVEMENTS] },
    status: { in: CLOSE_STATUSES },
  };
}
