import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation, getRequestMeta } from "@/lib/security";
import { updatePartyMembershipSchema } from "@/lib/security/schemas/party";
import { invalidateEntity } from "@/lib/cache";
import type { z } from "zod/v4";

type UpdateBody = z.infer<typeof updatePartyMembershipSchema>;

export const PATCH = withAdminAuth(
  withValidation(updatePartyMembershipSchema, async (request, context, body: UpdateBody) => {
    const { id, membershipId } = await context.params;

    const membership = await db.partyMembership.findUnique({
      where: { id: membershipId },
      select: { id: true, politicianId: true },
    });

    if (!membership || membership.politicianId !== id) {
      return NextResponse.json({ error: "Membership non trouvé" }, { status: 404 });
    }

    const updateData: Prisma.PartyMembershipUpdateInput = {};

    if (body.startDate !== undefined) {
      updateData.startDate = body.startDate ? new Date(body.startDate) : null;
    }

    if (body.endDate !== undefined) {
      updateData.endDate = body.endDate ? new Date(body.endDate) : null;
    }

    if (body.role !== undefined) {
      updateData.role = body.role;
    }

    // Validate dates
    if (updateData.startDate && updateData.endDate) {
      if (new Date(updateData.startDate as string) >= new Date(updateData.endDate as string)) {
        return NextResponse.json(
          { error: "La date de début doit être avant la date de fin" },
          { status: 400 }
        );
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 });
    }

    const updated = await db.partyMembership.update({
      where: { id: membershipId },
      data: updateData,
    });

    const politician = await db.politician.findUnique({
      where: { id },
      select: { slug: true },
    });

    const meta = getRequestMeta(request);
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "PartyMembership",
        entityId: membershipId!,
        changes: {
          startDate: updateData.startDate ? String(updateData.startDate) : undefined,
          endDate: updateData.endDate !== undefined ? String(updateData.endDate) : undefined,
          role: updateData.role ? String(updateData.role) : undefined,
        },
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    if (politician) {
      invalidateEntity("politician", politician.slug);
    }

    return NextResponse.json(updated);
  })
);

export const DELETE = withAdminAuth(async (request: NextRequest, context) => {
  const { id, membershipId } = await context.params;

  const membership = await db.partyMembership.findUnique({
    where: { id: membershipId },
    select: {
      id: true,
      politicianId: true,
      endDate: true,
      partyId: true,
    },
  });

  if (!membership || membership.politicianId !== id) {
    return NextResponse.json({ error: "Membership non trouvé" }, { status: 404 });
  }

  await db.partyMembership.delete({
    where: { id: membershipId },
  });

  // If deleting the current membership (no end date), clear currentPartyId
  if (!membership.endDate) {
    const politician = await db.politician.findUnique({
      where: { id },
      select: { currentPartyId: true },
    });

    if (politician?.currentPartyId === membership.partyId) {
      await db.politician.update({
        where: { id },
        data: { currentPartyId: null },
      });
    }
  }

  const politicianForSlug = await db.politician.findUnique({
    where: { id },
    select: { slug: true },
  });

  const meta = getRequestMeta(request);
  await db.auditLog.create({
    data: {
      action: "DELETE",
      entityType: "PartyMembership",
      entityId: membershipId!,
      changes: { partyId: membership.partyId },
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    },
  });

  if (politicianForSlug) {
    invalidateEntity("politician", politicianForSlug.slug);
  }

  return NextResponse.json({ success: true });
});
