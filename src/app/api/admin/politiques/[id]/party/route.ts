import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation, getRequestMeta } from "@/lib/security";
import { addPartyMembershipSchema } from "@/lib/security/schemas/party";
import { invalidateEntity } from "@/lib/cache";
import { requestProfileRefresh } from "@/lib/politicians/profile-snapshot/request";
import { setCurrentParty, removeParty } from "@/services/politician";
import type { z } from "zod/v4";

type AddBody = z.infer<typeof addPartyMembershipSchema>;

export const POST = withAdminAuth(
  withValidation(addPartyMembershipSchema, async (request, context, body: AddBody) => {
    const { id } = await context.params;

    const politician = await db.politician.findUnique({
      where: { id },
      select: { id: true, slug: true },
    });

    if (!politician) {
      return NextResponse.json({ error: "Politicien non trouvé" }, { status: 404 });
    }

    await setCurrentParty(id!, body.partyId, {
      startDate: body.startDate ? new Date(body.startDate) : new Date(),
      role: body.role || undefined,
    });

    const meta = getRequestMeta(request);
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "Politician",
        entityId: id!,
        changes: { partyChanged: body.partyId, startDate: body.startDate },
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    invalidateEntity("politician", politician.slug);
    await requestProfileRefresh({ politicianIds: [politician.id] }, "admin:parti-actuel");

    return NextResponse.json({ success: true });
  })
);

export const DELETE = withAdminAuth(async (request: NextRequest, context) => {
  const { id } = await context.params;

  const politician = await db.politician.findUnique({
    where: { id },
    select: { id: true, slug: true, currentPartyId: true },
  });

  if (!politician) {
    return NextResponse.json({ error: "Politicien non trouvé" }, { status: 404 });
  }

  if (!politician.currentPartyId) {
    return NextResponse.json({ error: "Aucun parti actuel" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const endDate = body.endDate ? new Date(body.endDate) : new Date();

  await removeParty(id!, endDate);

  const meta = getRequestMeta(request);
  await db.auditLog.create({
    data: {
      action: "UPDATE",
      entityType: "Politician",
      entityId: id!,
      changes: {
        partyRemoved: politician.currentPartyId,
        endDate: endDate.toISOString(),
      },
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    },
  });

  invalidateEntity("politician", politician.slug);
  await requestProfileRefresh({ politicianIds: [politician.id] }, "admin:parti-retiré");

  return NextResponse.json({ success: true });
});
