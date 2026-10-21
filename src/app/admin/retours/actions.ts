"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";

/**
 * Clôt un retour. L'adresse e-mail laissée par le visiteur est effacée à ce moment : elle ne
 * sert qu'à répondre, plus une fois le retour traité.
 */
export async function closeFeedback(id: string, status: "DONE" | "REJECTED") {
  if (!(await isAuthenticated())) throw new Error("Non autorisé");
  if (status !== "DONE" && status !== "REJECTED") throw new Error("Statut invalide");

  const feedback = await db.visitorFeedback.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!feedback) throw new Error("Retour introuvable");

  await db.visitorFeedback.update({
    where: { id },
    data: { status, resolvedAt: new Date(), contactEmail: null },
  });

  await db.auditLog.create({
    data: {
      action: "UPDATE",
      entityType: "VisitorFeedback",
      entityId: id,
      changes: { status: { from: feedback.status, to: status }, contactEmail: "purgé" },
    },
  });

  revalidatePath("/admin/retours");
}
