import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation, getRequestMeta } from "@/lib/security";
import { updateMandateSchema, patchMandateSchema } from "@/lib/security/schemas/mandate";
import { invalidateEntity } from "@/lib/cache";
import type { z } from "zod/v4";

type UpdateMandateBody = z.infer<typeof updateMandateSchema>;
type PatchMandateBody = z.infer<typeof patchMandateSchema>;

/**
 * GET /api/admin/mandates/[id]
 * Get a single mandate with politician and party included
 */
export const GET = withAdminAuth(async (_request: NextRequest, context) => {
  const { id } = await context.params;

  const mandate = await db.mandate.findUnique({
    where: { id },
    include: {
      politician: { select: { id: true, fullName: true, slug: true, photoUrl: true } },
      party: { select: { id: true, name: true, shortName: true } },
    },
  });

  if (!mandate) {
    return NextResponse.json({ error: "Mandat non trouvé" }, { status: 404 });
  }

  return NextResponse.json(mandate);
});

/**
 * PATCH /api/admin/mandates/[id]
 * Partial update (URLs only — legacy)
 */
export const PATCH = withAdminAuth(
  withValidation(patchMandateSchema, async (request, context, body: PatchMandateBody) => {
    const { id } = await context.params;

    const existing = await db.mandate.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Mandat non trouvé" }, { status: 404 });
    }

    const mandate = await db.mandate.update({
      where: { id },
      data: {
        officialUrl: body.officialUrl ?? undefined,
        sourceUrl: body.sourceUrl ?? undefined,
      },
    });

    const meta = getRequestMeta(request);
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "Mandate",
        entityId: mandate.id,
        changes: {
          officialUrl: mandate.officialUrl,
          sourceUrl: mandate.sourceUrl,
        },
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    invalidateEntity("mandate", undefined, { affectsListings: false });

    return NextResponse.json(mandate);
  })
);

/**
 * PUT /api/admin/mandates/[id]
 * Full update of a leadership mandate
 */
export const PUT = withAdminAuth(
  withValidation(updateMandateSchema, async (request, context, body: UpdateMandateBody) => {
    const { id } = await context.params;

    const { title, startDate, endDate, sourceUrl, officialUrl } = body;

    const existing = await db.mandate.findUnique({
      where: { id },
      select: { id: true, partyId: true, type: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Mandat non trouvé" }, { status: 404 });
    }

    const isCurrent = !endDate;

    // If making this mandate current, close other current leadership mandates for same party
    if (isCurrent && existing.partyId && existing.type === "PRESIDENT_PARTI") {
      await db.mandate.updateMany({
        where: {
          type: "PRESIDENT_PARTI",
          partyId: existing.partyId,
          isCurrent: true,
          id: { not: id },
        },
        data: {
          isCurrent: false,
          endDate: startDate ? new Date(startDate) : new Date(),
        },
      });
    }

    const mandate = await db.mandate.update({
      where: { id },
      data: {
        title: title ?? undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : null,
        isCurrent,
        sourceUrl: sourceUrl ?? undefined,
        officialUrl: officialUrl ?? undefined,
      },
      include: {
        politician: { select: { id: true, fullName: true, slug: true } },
        party: { select: { id: true, name: true, shortName: true } },
      },
    });

    const meta = getRequestMeta(request);
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "Mandate",
        entityId: mandate.id,
        changes: { title, startDate, endDate, isCurrent },
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    invalidateEntity("mandate");
    if (mandate.politician?.slug) invalidateEntity("politician", mandate.politician.slug);

    return NextResponse.json(mandate);
  })
);

/**
 * DELETE /api/admin/mandates/[id]
 * Delete a mandate (warns if source is WIKIDATA)
 */
export const DELETE = withAdminAuth(async (request: NextRequest, context) => {
  const { id } = await context.params;

  const existing = await db.mandate.findUnique({
    where: { id },
    select: { id: true, source: true, type: true, title: true, politicianId: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Mandat non trouvé" }, { status: 404 });
  }

  await db.mandate.delete({ where: { id } });

  const meta = getRequestMeta(request);
  await db.auditLog.create({
    data: {
      action: "DELETE",
      entityType: "Mandate",
      entityId: id!,
      changes: {
        type: existing.type,
        title: existing.title,
        source: existing.source,
        politicianId: existing.politicianId,
      },
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    },
  });

  invalidateEntity("mandate");
  const pol = await db.politician.findUnique({
    where: { id: existing.politicianId },
    select: { slug: true },
  });
  if (pol) invalidateEntity("politician", pol.slug);

  return NextResponse.json({ success: true });
});
