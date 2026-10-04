import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { invalidateEntity } from "@/lib/cache";
import { refreshProfilesForModeration } from "@/lib/politicians/profile-snapshot/moderation";
import { resolveProfileTargets } from "@/lib/politicians/profile-snapshot/request";
import { getRequestMeta } from "@/lib/security/audit";
import { withValidation } from "@/lib/security/validate";
import { updateFactcheckSchema } from "@/lib/security/schemas";

export const DELETE = withAdminAuth(async (request, context) => {
  const { id } = await context.params;

  const factCheck = await db.factCheck.findUnique({
    where: { id },
    select: { id: true, title: true },
  });

  if (!factCheck) {
    return NextResponse.json({ error: "Fact-check non trouvé" }, { status: 404 });
  }

  // Resolved before the delete: the mentions cascade with it.
  const profileTargets = await resolveProfileTargets({ factCheckId: id! });

  // Cascade: mentions
  await db.factCheck.delete({ where: { id } });

  const { ip, userAgent } = getRequestMeta(request);
  await db.auditLog.create({
    data: {
      action: "DELETE",
      entityType: "FactCheck",
      entityId: id!,
      changes: { title: factCheck.title },
      ipAddress: ip,
      userAgent,
    },
  });

  invalidateEntity("factcheck");
  await refreshProfilesForModeration(
    { politicianIds: profileTargets },
    "admin:fact-check-supprimé"
  );

  return NextResponse.json({ success: true });
});

export const PATCH = withAdminAuth(
  withValidation(updateFactcheckSchema, async (request, context, body) => {
    const { id } = await context.params;

    const factCheck = await db.factCheck.findUnique({
      where: { id },
      select: { id: true, title: true, verdictRating: true, publicationStatus: true },
    });

    if (!factCheck) {
      return NextResponse.json({ error: "Fact-check non trouve" }, { status: 404 });
    }

    const updateData: Record<string, string> = {};
    if (body.publicationStatus !== undefined) {
      updateData.publicationStatus = body.publicationStatus;
    }
    if (body.verdictRating !== undefined) {
      updateData.verdictRating = body.verdictRating;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "Aucun champ a mettre a jour" }, { status: 400 });
    }

    const updated = await db.factCheck.update({
      where: { id },
      data: updateData,
    });

    const { ip, userAgent } = getRequestMeta(request);
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "FactCheck",
        entityId: id!,
        changes: updateData,
        ipAddress: ip,
        userAgent,
      },
    });

    invalidateEntity("factcheck");
    await refreshProfilesForModeration({ factCheckId: id! }, "admin:fact-check-modifié");

    return NextResponse.json(updated);
  })
);
