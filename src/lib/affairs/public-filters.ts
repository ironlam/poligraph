import { Prisma } from "@/generated/prisma";
import type { AffairStatus, Involvement, JurisdictionOrder } from "@/generated/prisma";
import { ADVERSE_INVOLVEMENTS } from "@/config/certainty";
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

/** Involvements comptés dans les agrégats à charge : DIRECT seul, jamais INDIRECT (témoin). */
export { ADVERSE_INVOLVEMENTS };

/** Involvements listés par défaut sur /affaires (mode « mis en cause »), sans valeur de charge. */
export const DEFAULT_LISTING_INVOLVEMENTS = ["DIRECT", "INDIRECT", "MENTIONED_ONLY"] as const;

/** Involvements listés en mode « victime ». */
export const VICTIM_LISTING_INVOLVEMENTS = ["VICTIM", "PLAINTIFF"] as const;

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

/** SQL equivalent of the adverse involvement filter, restricted to reviewed aliases. */
export function getAdverseInvolvementSql(alias: "a" = "a"): Prisma.Sql {
  if (alias !== "a") {
    throw new Error(`Unsupported public affair SQL alias: ${alias}`);
  }

  return Prisma.sql`a.involvement IN (${Prisma.join([...ADVERSE_INVOLVEMENTS])})`;
}

/** Version en mémoire des agrégats à charge, équivalente à getAdverseAffairWhere(). */
export function isCountedInAdverseAggregates(affair: {
  involvement: Involvement;
  status: AffairStatus;
  jurisdictionOrder: JurisdictionOrder;
}): boolean {
  return (
    (ADVERSE_INVOLVEMENTS as readonly Involvement[]).includes(affair.involvement) &&
    affair.jurisdictionOrder === ADVERSE_JURISDICTION_ORDER &&
    AGGREGATE_STATUSES.includes(affair.status)
  );
}

/** Périmètre documentaire d'un listing : publié et involvement dans la liste, sans valeur de charge. */
export function getDocumentaryAffairWhere(
  involvements: readonly Involvement[]
): Prisma.AffairWhereInput {
  return {
    publicationStatus: PUBLIC_AFFAIR_PUBLICATION_STATUS,
    involvement: { in: [...involvements] },
  };
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
 * Garde le filtre DIRECT : ce compteur recense les procédures visant la
 * personne mise en cause, pas celles où elle est témoin (INDIRECT), victime
 * ou plaignante.
 */
export function getFavorableOutcomeWhere(): Prisma.AffairWhereInput {
  return {
    publicationStatus: PUBLIC_AFFAIR_PUBLICATION_STATUS,
    involvement: { in: [...ADVERSE_INVOLVEMENTS] },
    status: { in: CLOSE_STATUSES },
  };
}
