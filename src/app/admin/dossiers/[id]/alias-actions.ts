"use server";

import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { db } from "@/lib/db";
import { invalidateEntity } from "@/lib/cache";
import { normalizeDossierAlias } from "@/lib/legislation/alias";
import { revalidatePath } from "next/cache";

const aliasInputSchema = z
  .object({
    dossierId: z.string().min(1),
    label: z.string().trim().min(3).max(160),
    kind: z.enum(["MEDIA", "COMMON", "OFFICIAL_SHORT", "HISTORICAL"]),
    sourceUrl: z
      .string()
      .url()
      .refine((url) => ["http:", "https:"].includes(new URL(url).protocol)),
    sourceLabel: z.string().trim().min(2).max(200),
  })
  .strict();

const idSchema = z.string().min(1);

async function assertAuthenticated() {
  if (!(await isAuthenticated())) throw new Error("Non autorisé");
}

function revalidateDossier(dossierId: string) {
  revalidatePath(`/admin/dossiers/${dossierId}`);
  revalidatePath("/parlement/dossiers", "layout");
  invalidateEntity("dossier");
}

export async function createDossierAlias(input: {
  dossierId: string;
  label: string;
  kind: "MEDIA" | "COMMON" | "OFFICIAL_SHORT" | "HISTORICAL";
  sourceUrl: string;
  sourceLabel: string;
}) {
  await assertAuthenticated();
  const parsed = aliasInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "Les informations sont invalides." };

  const normalizedLabel = normalizeDossierAlias(parsed.data.label);
  if (!normalizedLabel) return { ok: false as const, message: "Le nom d’usage est vide." };

  try {
    const alias = await db.legislativeDossierAlias.create({
      data: {
        dossierId: parsed.data.dossierId,
        label: parsed.data.label,
        normalizedLabel,
        kind: parsed.data.kind,
        sources: [{ url: parsed.data.sourceUrl, label: parsed.data.sourceLabel }],
      },
    });
    await db.auditLog.create({
      data: {
        action: "CREATE",
        entityType: "LegislativeDossierAlias",
        entityId: alias.id,
        changes: parsed.data,
      },
    });
    revalidateDossier(parsed.data.dossierId);
    return { ok: true as const };
  } catch {
    return { ok: false as const, message: "Ce nom d’usage existe déjà pour ce dossier." };
  }
}

export async function publishDossierAlias(aliasId: string, isPreferred: boolean) {
  await assertAuthenticated();
  const parsedId = idSchema.safeParse(aliasId);
  if (!parsedId.success) return { ok: false as const, message: "Alias invalide." };

  const alias = await db.legislativeDossierAlias.findUnique({ where: { id: parsedId.data } });
  if (!alias) return { ok: false as const, message: "Alias introuvable." };
  const sources = Array.isArray(alias.sources) ? alias.sources : [];
  if (sources.length === 0) return { ok: false as const, message: "Une source est requise." };

  await db.$transaction(async (tx) => {
    if (isPreferred) {
      await tx.legislativeDossierAlias.updateMany({
        where: { dossierId: alias.dossierId, isPreferred: true },
        data: { isPreferred: false },
      });
    }
    await tx.legislativeDossierAlias.update({
      where: { id: alias.id },
      data: { status: "PUBLISHED", isPreferred, verifiedAt: new Date(), verifiedBy: "admin" },
    });
    await tx.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "LegislativeDossierAlias",
        entityId: alias.id,
        changes: { status: "PUBLISHED", isPreferred },
      },
    });
  });
  revalidateDossier(alias.dossierId);
  return { ok: true as const };
}

export async function deleteDossierAlias(aliasId: string) {
  await assertAuthenticated();
  const parsedId = idSchema.safeParse(aliasId);
  if (!parsedId.success) return { ok: false as const, message: "Alias invalide." };
  const alias = await db.legislativeDossierAlias.findUnique({ where: { id: parsedId.data } });
  if (!alias) return { ok: false as const, message: "Alias introuvable." };
  await db.legislativeDossierAlias.delete({ where: { id: alias.id } });
  await db.auditLog.create({
    data: {
      action: "DELETE",
      entityType: "LegislativeDossierAlias",
      entityId: alias.id,
      changes: {},
    },
  });
  revalidateDossier(alias.dossierId);
  return { ok: true as const };
}
