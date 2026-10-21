"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";

/**
 * Clôt un retour. L'adresse e-mail laissée par le visiteur est effacée à ce moment : elle ne
 * sert qu'à répondre, plus une fois le retour traité.
 *
 * La clôture et son audit partent dans une même transaction : l'effacement de l'e-mail ne se
 * rattrape pas, il ne doit donc jamais exister sans trace de qui l'a fait.
 */
export async function closeFeedback(id: string, status: "DONE" | "REJECTED") {
  if (!(await isAuthenticated())) throw new Error("Non autorisé");
  if (status !== "DONE" && status !== "REJECTED") throw new Error("Statut invalide");

  const requestHeaders = await headers();
  const ipAddress = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const userAgent = requestHeaders.get("user-agent");

  await db.$transaction(async (tx) => {
    const feedback = await tx.visitorFeedback.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!feedback) throw new Error("Retour introuvable");
    if (feedback.status !== "NEW") throw new Error("Retour déjà clos");

    await tx.visitorFeedback.update({
      where: { id },
      data: { status, resolvedAt: new Date(), contactEmail: null },
    });

    await tx.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "VisitorFeedback",
        entityId: id,
        changes: { status: { from: feedback.status, to: status }, contactEmail: "purgé" },
        ipAddress,
        userAgent,
      },
    });
  });

  revalidatePath("/admin/retours");
}
