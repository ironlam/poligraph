"use server";

import { db } from "@/lib/db";
import { invalidateEntity } from "@/lib/cache";
import { refreshProfilesForModeration } from "@/lib/politicians/profile-snapshot/moderation";
import { isAuthenticated } from "@/lib/auth";
import { PublicationStatus } from "@/generated/prisma";
import { revalidatePath } from "next/cache";

export async function updateFactcheckStatus(id: string, status: PublicationStatus) {
  if (!(await isAuthenticated())) throw new Error("Non autorise");

  const factCheck = await db.factCheck.findUnique({
    where: { id },
    select: { publicationStatus: true },
  });

  await db.factCheck.update({
    where: { id },
    data: { publicationStatus: status },
  });

  await db.auditLog.create({
    data: {
      action: "UPDATE",
      entityType: "FactCheck",
      entityId: id,
      changes: { publicationStatus: { from: factCheck?.publicationStatus, to: status } },
    },
  });

  invalidateEntity("factcheck");
  await refreshProfilesForModeration({ factCheckId: id }, "admin:fact-check-statut");
  revalidatePath("/admin/factchecks");
}
