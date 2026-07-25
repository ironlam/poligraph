/**
 * Court decisions, and their links to editorial affairs (#536).
 *
 * A `CourtDecision` is a decision handed down by an identified jurisdiction, whatever
 * its order or subject matter. A `CourtDecision` is not an affair: one decision can
 * carry several counts and therefore reach several Poligraph fiches, which is what
 * `Affair.ecli @unique` made impossible to record.
 *
 * Deliberately absent from this module: any lookup or upsert keyed on the pourvoi
 * number. A pourvoi can produce several decisions (rejection, partial cassation,
 * remand), so reusing a row on that basis would silently merge two decisions. The
 * only identities safe to reuse automatically are `judilibreId` and `ecli`.
 */

import { db, type DbTransactionClient } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";

/**
 * Strips every separator from a pourvoi number so two spellings of the same
 * reference compare equal: « 96-83.698 » and « 96-83698 » both give « 9683698 ».
 *
 * Pure, and the only normalisation the model relies on. Used to *find* candidates,
 * never to decide that two rows are the same decision.
 */
export function normalizePourvoiNumber(raw: string): string {
  return (
    raw
      .normalize("NFD")
      // \p{Mn} keeps this ASCII-only: a literal combining-mark range is invisible in source.
      .replace(/\p{Mn}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
  );
}

export interface CreateCourtDecisionInput {
  judilibreId?: string | null;
  ecli?: string | null;
  /** As published, for display. The normalised form is derived, never passed in. */
  pourvoiNumber?: string | null;
  decisionDate?: Date | null;
  /**
   * The issuing jurisdiction, never a prosecution office. Only ever set from an
   * official source: 23.7 % of `Affair.court` values name a body that renders no
   * decision, so that field must not be copied here.
   */
  court?: string | null;
  chamber?: string | null;
  solution?: string | null;
  sourceUrl?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}

type Client = DbTransactionClient | typeof db;

/** Derives the normalised form so no caller can put the two out of step. */
function toCreateData(input: CreateCourtDecisionInput) {
  return {
    judilibreId: input.judilibreId ?? null,
    ecli: input.ecli ?? null,
    pourvoiNumber: input.pourvoiNumber ?? null,
    pourvoiNumberNormalized: input.pourvoiNumber
      ? normalizePourvoiNumber(input.pourvoiNumber)
      : null,
    decisionDate: input.decisionDate ?? null,
    court: input.court ?? null,
    chamber: input.chamber ?? null,
    solution: input.solution ?? null,
    sourceUrl: input.sourceUrl ?? null,
    ...(input.metadata === null || input.metadata === undefined
      ? {}
      : { metadata: input.metadata }),
  };
}

export async function createCourtDecision(
  input: CreateCourtDecisionInput,
  client: Client = db
): Promise<{ id: string }> {
  return client.courtDecision.create({ data: toCreateData(input), select: { id: true } });
}

export async function findCourtDecisionById(id: string, client: Client = db) {
  return client.courtDecision.findUnique({ where: { id } });
}

/** An ECLI identifies exactly one decision, so this lookup is safe to act on. */
export async function findCourtDecisionByEcli(ecli: string, client: Client = db) {
  return client.courtDecision.findUnique({ where: { ecli } });
}

/** A Judilibre id is an external primary key, so this lookup is safe to act on. */
export async function findCourtDecisionByJudilibreId(judilibreId: string, client: Client = db) {
  return client.courtDecision.findUnique({ where: { judilibreId } });
}

/**
 * Candidates sharing a normalised pourvoi number.
 *
 * Returns a list on purpose. A pourvoi is not unique, so the caller has to decide
 * what to do with zero, one, or several rows — and stop rather than guess when
 * several come back.
 */
export async function findCourtDecisionsByPourvoiNumber(
  pourvoiNumber: string,
  client: Client = db
) {
  return client.courtDecision.findMany({
    where: { pourvoiNumberNormalized: normalizePourvoiNumber(pourvoiNumber) },
  });
}

/**
 * Links an affair to a decision. Idempotent: relinking the same pair is a no-op
 * rather than a constraint violation.
 */
export async function linkAffairToCourtDecision(
  input: { affairId: string; courtDecisionId: string; notes?: string | null },
  client: Client = db
): Promise<{ created: boolean }> {
  const existing = await client.affairCourtDecision.findUnique({
    where: {
      affairId_courtDecisionId: {
        affairId: input.affairId,
        courtDecisionId: input.courtDecisionId,
      },
    },
    select: { affairId: true },
  });
  if (existing) return { created: false };

  await client.affairCourtDecision.create({
    data: {
      affairId: input.affairId,
      courtDecisionId: input.courtDecisionId,
      notes: input.notes ?? null,
    },
  });
  return { created: true };
}

/**
 * Removes a link. Never deletes the decision: a decision outlives the fiches that
 * cite it, and unlinking is an editorial act on the affair, not on the decision.
 */
export async function unlinkAffairFromCourtDecision(
  input: { affairId: string; courtDecisionId: string },
  client: Client = db
): Promise<{ deleted: boolean }> {
  const result = await client.affairCourtDecision.deleteMany({
    where: { affairId: input.affairId, courtDecisionId: input.courtDecisionId },
  });
  return { deleted: result.count > 0 };
}

export async function listCourtDecisionsForAffair(affairId: string, client: Client = db) {
  const links = await client.affairCourtDecision.findMany({
    where: { affairId },
    include: { courtDecision: true },
    orderBy: { createdAt: "asc" },
  });
  return links.map((link) => ({ ...link.courtDecision, linkNotes: link.notes }));
}

export async function listAffairIdsForCourtDecision(courtDecisionId: string, client: Client = db) {
  const links = await client.affairCourtDecision.findMany({
    where: { courtDecisionId },
    select: { affairId: true },
  });
  return links.map((link) => link.affairId);
}
