import type { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import { DEPARTMENTS } from "@/config/departments";
import { getRegionByCode } from "@/config/regions";
import type { RequestMeta } from "@/lib/security/audit";
import type { RapportCrcActionInput } from "@/lib/security/schemas/rapport-crc";

/**
 * Review of the draft notices of regional audit chamber reports (Territoires v2, lot C). Only a
 * DRAFT is acted on: a person chooses or corrects its territory, publishes it once a territory is
 * set, or rejects it. Every change lands in AuditLog in the same transaction, and a concurrent
 * change is refused rather than overwritten.
 *
 * Publishing revalidates nothing: the territory pages follow their 24 h cache (no mass
 * revalidation, spend cap).
 */

export type RapportCrcValidationResult =
  | { ok: true; id: string }
  | { ok: false; httpStatus: 400 | 404 | 409; message: string };

async function territoireExiste(type: "COM" | "DEP" | "REG", code: string): Promise<boolean> {
  if (type === "DEP") return code in DEPARTMENTS;
  if (type === "REG") return getRegionByCode(code) !== null;
  return (await db.commune.count({ where: { id: code } })) === 1;
}

export async function traiterRapportCrc(
  id: string,
  input: RapportCrcActionInput,
  meta: RequestMeta
): Promise<RapportCrcValidationResult> {
  const current = await db.territoireEvenement.findFirst({
    where: { id, type: "RAPPORT_CRC" },
    select: { status: true, territoryType: true, territoryCode: true },
  });
  if (!current) return { ok: false, httpStatus: 404, message: "Notice introuvable." };
  if (current.status !== "DRAFT") {
    return { ok: false, httpStatus: 409, message: "Seul un brouillon se traite ici." };
  }

  let data: {
    status?: "PUBLISHED" | "REJECTED";
    territoryType?: "COM" | "DEP" | "REG";
    territoryCode?: string;
  };
  let changes: Prisma.InputJsonObject;
  if (input.action === "RATTACHER") {
    if (!(await territoireExiste(input.territoryType, input.territoryCode))) {
      return { ok: false, httpStatus: 400, message: "Ce territoire n'existe pas." };
    }
    data = { territoryType: input.territoryType, territoryCode: input.territoryCode };
    changes = {
      from: { territoryType: current.territoryType, territoryCode: current.territoryCode },
      to: data,
    };
  } else if (input.action === "PUBLIER") {
    if (!current.territoryCode) {
      return { ok: false, httpStatus: 409, message: "Choisissez d'abord le territoire." };
    }
    data = { status: "PUBLISHED" };
    changes = {
      from: "DRAFT",
      to: "PUBLISHED",
      territoryType: current.territoryType,
      territoryCode: current.territoryCode,
      reviewedBy: input.reviewedBy,
    };
  } else {
    data = { status: "REJECTED" };
    changes = { from: "DRAFT", to: "REJECTED", reason: input.reason };
  }

  return db.$transaction(async (tx) => {
    // The territory read above must still be the one published: a correction in between wins.
    const { count } = await tx.territoireEvenement.updateMany({
      where: {
        id,
        status: "DRAFT",
        territoryType: current.territoryType,
        territoryCode: current.territoryCode,
      },
      data,
    });
    if (count === 0) {
      return {
        ok: false as const,
        httpStatus: 409 as const,
        message: "La notice a changé entre-temps. Rechargez la page.",
      };
    }
    await tx.auditLog.create({
      data: {
        action: input.action,
        entityType: "TerritoireEvenement",
        entityId: id,
        changes,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    return { ok: true as const, id };
  });
}
