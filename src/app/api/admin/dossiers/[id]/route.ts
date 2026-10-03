import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation, getRequestMeta } from "@/lib/security";
import { updateDossierSchema } from "@/lib/security/schemas/dossier";
import { invalidateEntity } from "@/lib/cache";
import { requestProfileRefresh } from "@/lib/politicians/profile-snapshot/request";
import type { z } from "zod/v4";

type UpdateDossierBody = z.infer<typeof updateDossierSchema>;

// GET /api/admin/dossiers/[id] - Get dossier details
export const GET = withAdminAuth(async (_request: NextRequest, context) => {
  const { id } = await context.params;

  const dossier = await db.legislativeDossier.findUnique({
    where: { id },
    include: {
      amendments: {
        orderBy: { number: "asc" },
      },
    },
  });

  if (!dossier) {
    return NextResponse.json({ error: "Dossier non trouvé" }, { status: 404 });
  }

  return NextResponse.json(dossier);
});

// PUT /api/admin/dossiers/[id] - Update dossier
export const PUT = withAdminAuth(
  withValidation(updateDossierSchema, async (request, context, body: UpdateDossierBody) => {
    const { id } = await context.params;

    // Check dossier exists
    const existing = await db.legislativeDossier.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Dossier non trouvé" }, { status: 404 });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (body.summary !== undefined) {
      updateData.summary = body.summary;
      updateData.summaryDate = new Date();
    }

    if (body.shortTitle !== undefined) {
      updateData.shortTitle = body.shortTitle;
    }

    if (body.category !== undefined) {
      updateData.category = body.category;
    }

    if (body.status !== undefined) {
      updateData.status = body.status;
    }

    if (body.theme !== undefined) {
      updateData.theme = body.theme;
    }

    const updated = await db.legislativeDossier.update({
      where: { id },
      data: updateData,
    });

    // Audit log
    const meta = getRequestMeta(request);
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "LegislativeDossier",
        entityId: id!,
        changes: updateData as Record<string, string>,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    invalidateEntity("dossier");
    // The short title and status show in the "Propositions de loi" of the authors' profiles.
    await requestProfileRefresh({ dossierId: id! }, "admin:dossier-modifié");

    return NextResponse.json(updated);
  })
);
