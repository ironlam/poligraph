import type { CurationStatus } from "@/generated/prisma";
import { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import type { RequestMeta } from "@/lib/security/audit";
import type { DecisionTransitionInput } from "@/lib/security/schemas/decision-territoriale";
import { missingTransitionInput, resolveTransition } from "@/lib/territoires/decisions";

/**
 * Publication of an import batch of "Le territoire en chiffres" (#1052). A batch is read and
 * published as a whole, by a named person: the transitions and the guards are those of the
 * territorial decisions (DRAFT, IN_REVIEW, PUBLISHED, REJECTED).
 *
 * Publishing sets NO cache tag and revalidates nothing: the pages follow their 24 h profile (no
 * mass revalidation, spend cap). Every transition lands in AuditLog in the same transaction.
 */

export type LotTransitionResult =
  | { ok: true; id: string; status: CurationStatus }
  | { ok: false; httpStatus: 400 | 404 | 409; message: string };

/** Rows whose state contradicts their value: a figure with no value, or a value with no figure. */
async function incoherentRows(lotId: string): Promise<number> {
  const [row] = await db.$queryRaw<{ n: number }[]>(Prisma.sql`
    SELECT COUNT(*)::int AS n FROM "TerritoireRepere"
    WHERE "importId" = ${lotId}
      AND (("state" IN ('ETABLI', 'PARTIEL') AND "value" IS NULL)
        OR ("state" NOT IN ('ETABLI', 'PARTIEL') AND "value" IS NOT NULL))
  `);
  return row?.n ?? 0;
}

export async function transitionLot(
  id: string,
  input: DecisionTransitionInput,
  meta: RequestMeta
): Promise<LotTransitionResult> {
  const missing = missingTransitionInput(input);
  if (missing) return { ok: false, httpStatus: 400, message: missing };

  const current = await db.repereImport.findUnique({
    where: { id },
    select: { status: true, rowCount: true },
  });
  if (!current) return { ok: false, httpStatus: 404, message: "Lot introuvable." };

  const to = resolveTransition(current.status, input.action);
  if (!to) {
    return {
      ok: false,
      httpStatus: 409,
      message: "Cette action n'est pas possible depuis l'état actuel du lot.",
    };
  }

  if (input.action === "PUBLISH") {
    const rows = await db.territoireRepere.count({ where: { importId: id } });
    if (rows !== current.rowCount) {
      return {
        ok: false,
        httpStatus: 409,
        message: `Le lot compte ${rows} lignes, ${current.rowCount} annoncées : publication refusée.`,
      };
    }
    const bad = await incoherentRows(id);
    if (bad > 0) {
      return {
        ok: false,
        httpStatus: 409,
        message: `${bad} lignes dont l'état contredit la valeur : publication refusée.`,
      };
    }
  }

  const now = new Date();
  return db.$transaction(async (tx) => {
    const { count } = await tx.repereImport.updateMany({
      where: { id, status: current.status },
      data: {
        status: to,
        ...(input.action === "PUBLISH" && { reviewedAt: now, reviewedBy: input.reviewedBy }),
      },
    });
    if (count === 0) {
      return {
        ok: false as const,
        httpStatus: 409 as const,
        message: "Le lot a changé d'état entre-temps. Rechargez la page.",
      };
    }
    await tx.auditLog.create({
      data: {
        action: input.action,
        entityType: "RepereImport",
        entityId: id,
        changes: {
          from: current.status,
          to,
          rows: current.rowCount,
          reviewedBy: input.reviewedBy,
          reason: input.reason,
        },
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    return { ok: true as const, id, status: to };
  });
}
