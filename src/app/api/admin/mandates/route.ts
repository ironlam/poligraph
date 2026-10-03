import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation, getRequestMeta } from "@/lib/security";
import { createMandateSchema } from "@/lib/security/schemas/mandate";
import { invalidateEntity } from "@/lib/cache";
import { requestProfileRefresh } from "@/lib/politicians/profile-snapshot/request";
import { MandateType } from "@/generated/prisma";
import type { z } from "zod/v4";

const VALID_MANDATE_TYPES = new Set(Object.values(MandateType));

type CreateMandateBody = z.infer<typeof createMandateSchema>;

/**
 * POST /api/admin/mandates
 * Create a party leadership mandate (PRESIDENT_PARTI)
 */
export const POST = withAdminAuth(
  withValidation(createMandateSchema, async (request, context, body: CreateMandateBody) => {
    const { politicianId, partyId, title, startDate, endDate, sourceUrl, officialUrl } = body;

    // Validate politician exists
    const politician = await db.politician.findUnique({
      where: { id: politicianId },
      select: { id: true, fullName: true },
    });
    if (!politician) {
      return NextResponse.json({ error: "Politicien non trouvé" }, { status: 404 });
    }

    // Validate party exists
    const party = await db.party.findUnique({
      where: { id: partyId },
      select: { id: true, name: true },
    });
    if (!party) {
      return NextResponse.json({ error: "Parti non trouvé" }, { status: 404 });
    }

    const isCurrent = !endDate;

    // If this is a current mandate, close previous current leadership mandates for this party
    // Their holders' profiles show the closed mandate too.
    const closedHolderIds: string[] = [];
    if (isCurrent) {
      const closing = await db.mandate.findMany({
        where: { type: "PRESIDENT_PARTI", partyId, isCurrent: true },
        select: { politicianId: true },
      });
      closedHolderIds.push(...closing.map((m) => m.politicianId));
      await db.mandate.updateMany({
        where: {
          type: "PRESIDENT_PARTI",
          partyId,
          isCurrent: true,
        },
        data: {
          isCurrent: false,
          endDate: new Date(startDate),
        },
      });
    }

    const mandate = await db.mandate.create({
      data: {
        politicianId,
        partyId,
        type: "PRESIDENT_PARTI",
        title,
        institution: party.name,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        isCurrent,
        source: "MANUAL",
        sourceUrl: sourceUrl || null,
        officialUrl: officialUrl || null,
      },
      include: {
        politician: { select: { id: true, fullName: true, slug: true } },
        party: { select: { id: true, name: true, shortName: true } },
      },
    });

    const meta = getRequestMeta(request);
    await db.auditLog.create({
      data: {
        action: "CREATE",
        entityType: "Mandate",
        entityId: mandate.id,
        changes: {
          type: "PRESIDENT_PARTI",
          politicianId,
          partyId,
          title,
          startDate,
          endDate: endDate || null,
          source: "MANUAL",
        },
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    invalidateEntity("mandate");
    const polWithSlug = await db.politician.findUnique({
      where: { id: politicianId },
      select: { slug: true },
    });
    if (polWithSlug) invalidateEntity("politician", polWithSlug.slug);
    await requestProfileRefresh(
      { politicianIds: [politicianId, ...closedHolderIds] },
      "admin:mandat-créé"
    );

    return NextResponse.json(mandate, { status: 201 });
  })
);

/**
 * GET /api/admin/mandates?partyId=...&type=PRESIDENT_PARTI
 * List mandates with optional filters
 */
export const GET = withAdminAuth(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const partyId = searchParams.get("partyId");
  const typeParam = searchParams.get("type");
  const type =
    typeParam && VALID_MANDATE_TYPES.has(typeParam as MandateType)
      ? (typeParam as MandateType)
      : undefined;

  const mandates = await db.mandate.findMany({
    where: {
      ...(partyId && { partyId }),
      ...(type && { type }),
    },
    include: {
      politician: { select: { id: true, fullName: true, slug: true, photoUrl: true } },
      party: { select: { id: true, name: true, shortName: true } },
    },
    orderBy: [{ isCurrent: "desc" }, { startDate: "desc" }],
  });

  return NextResponse.json(mandates);
});
