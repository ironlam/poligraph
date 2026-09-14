"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { Prisma, type LegislativeDossierAlias } from "@/generated/prisma";
import { isAuthenticated } from "@/lib/auth";
import { db } from "@/lib/db";
import { invalidateEntity } from "@/lib/cache";
import { normalizeDossierAlias, dossierAliasSourcesSchema } from "@/lib/legislation/alias";

const aliasInputSchema = z
  .object({
    dossierId: z.string().min(1),
    label: z.string().trim().min(3).max(160),
    kind: z.enum(["MEDIA", "COMMON", "OFFICIAL_SHORT", "HISTORICAL"]),
    sources: dossierAliasSourcesSchema,
  })
  .strict();
const idSchema = z.string().min(1);
const failure = (message: string) => ({ ok: false as const, message });

async function auditContext() {
  if (!(await isAuthenticated())) throw new Error("Non autorisé");
  const h = await headers();
  return {
    ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    userAgent: h.get("user-agent"),
    userId: "admin",
  };
}

function snapshot(alias: LegislativeDossierAlias): Prisma.InputJsonObject {
  return {
    dossierId: alias.dossierId,
    label: alias.label,
    normalizedLabel: alias.normalizedLabel,
    kind: alias.kind,
    status: alias.status,
    isPreferred: alias.isPreferred,
    sources: alias.sources,
    verifiedAt: alias.verifiedAt?.toISOString() ?? null,
    verifiedBy: alias.verifiedBy,
  };
}

function revalidateDossier(dossierId: string) {
  revalidatePath(`/admin/dossiers/${dossierId}`);
  revalidatePath("/parlement/dossiers", "layout");
  invalidateEntity("dossier");
}

export async function createDossierAlias(input: unknown) {
  const context = await auditContext();
  const parsed = aliasInputSchema.safeParse(input);
  if (!parsed.success) return failure("Les informations sont invalides.");
  const normalizedLabel = normalizeDossierAlias(parsed.data.label);
  if (!normalizedLabel) return failure("Le nom d’usage est vide.");
  let aliasCreated = false;
  try {
    await db.$transaction(async (tx) => {
      const alias = await tx.legislativeDossierAlias.create({
        data: { ...parsed.data, normalizedLabel },
      });
      aliasCreated = true;
      await tx.auditLog.create({
        data: {
          ...context,
          action: "CREATE",
          entityType: "LegislativeDossierAlias",
          entityId: alias.id,
          changes: { after: snapshot(alias) },
        },
      });
    });
  } catch (error) {
    if (
      !aliasCreated &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return failure("Ce nom d’usage existe déjà pour ce dossier.");
    }
    return failure("L’enregistrement a échoué. Aucune modification n’a été conservée.");
  }
  revalidateDossier(parsed.data.dossierId);
  return { ok: true as const };
}

export async function updateDossierAliasSources(aliasId: string, input: unknown) {
  const context = await auditContext();
  const sources = dossierAliasSourcesSchema.safeParse(input);
  if (!idSchema.safeParse(aliasId).success || !sources.success)
    return failure("Sources invalides.");
  const result = await db.$transaction(
    async (tx) => {
      const before = await tx.legislativeDossierAlias.findUnique({ where: { id: aliasId } });
      if (!before) return null;
      // A changed evidence set must be reviewed again before appearing publicly.
      const after = await tx.legislativeDossierAlias.update({
        where: { id: aliasId },
        data: {
          sources: sources.data,
          status: "DRAFT",
          isPreferred: false,
          verifiedAt: null,
          verifiedBy: null,
        },
      });
      await tx.auditLog.create({
        data: {
          ...context,
          action: "UPDATE",
          entityType: "LegislativeDossierAlias",
          entityId: aliasId,
          changes: { before: snapshot(before), after: snapshot(after) },
        },
      });
      return after;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
  if (!result) return failure("Alias introuvable.");
  revalidateDossier(result.dossierId);
  return { ok: true as const };
}

export async function publishDossierAlias(aliasId: string, isPreferred: boolean) {
  const context = await auditContext();
  if (!idSchema.safeParse(aliasId).success || !z.boolean().safeParse(isPreferred).success)
    return failure("Alias invalide.");
  const result = await db.$transaction(
    async (tx) => {
      const before = await tx.legislativeDossierAlias.findUnique({ where: { id: aliasId } });
      if (!before) return { error: "Alias introuvable." };
      if (!dossierAliasSourcesSchema.safeParse(before.sources).success)
        return { error: "Des sources valides sont requises." };
      const displaced = isPreferred
        ? await tx.legislativeDossierAlias.findMany({
            where: { dossierId: before.dossierId, isPreferred: true, id: { not: aliasId } },
          })
        : [];
      for (const previous of displaced) {
        const after = await tx.legislativeDossierAlias.update({
          where: { id: previous.id },
          data: { isPreferred: false },
        });
        await tx.auditLog.create({
          data: {
            ...context,
            action: "UPDATE",
            entityType: "LegislativeDossierAlias",
            entityId: previous.id,
            changes: { before: snapshot(previous), after: snapshot(after) },
          },
        });
      }
      const after = await tx.legislativeDossierAlias.update({
        where: { id: aliasId },
        data: { status: "PUBLISHED", isPreferred, verifiedAt: new Date(), verifiedBy: "admin" },
      });
      await tx.auditLog.create({
        data: {
          ...context,
          action: "UPDATE",
          entityType: "LegislativeDossierAlias",
          entityId: aliasId,
          changes: { before: snapshot(before), after: snapshot(after) },
        },
      });
      return { dossierId: before.dossierId };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
  if (result.error) return failure(result.error);
  revalidateDossier(result.dossierId!);
  return { ok: true as const };
}

export async function deleteDossierAlias(aliasId: string) {
  const context = await auditContext();
  if (!idSchema.safeParse(aliasId).success) return failure("Alias invalide.");
  const before = await db.$transaction(
    async (tx) => {
      const alias = await tx.legislativeDossierAlias.findUnique({ where: { id: aliasId } });
      if (!alias) return null;
      await tx.legislativeDossierAlias.delete({ where: { id: aliasId } });
      await tx.auditLog.create({
        data: {
          ...context,
          action: "DELETE",
          entityType: "LegislativeDossierAlias",
          entityId: aliasId,
          changes: { before: snapshot(alias) },
        },
      });
      return alias;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
  if (!before) return failure("Alias introuvable.");
  revalidateDossier(before.dossierId);
  return { ok: true as const };
}
