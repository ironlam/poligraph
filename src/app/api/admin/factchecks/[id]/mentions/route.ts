import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation } from "@/lib/security/validate";
import { addFactcheckMentionSchema } from "@/lib/security/schemas";
import { getRequestMeta } from "@/lib/security/audit";
import { invalidateEntity } from "@/lib/cache";
import { requestProfileRefresh } from "@/lib/politicians/profile-snapshot/request";

export const POST = withAdminAuth(
  withValidation(addFactcheckMentionSchema, async (request, context, body) => {
    const { id } = await context.params;

    const factCheck = await db.factCheck.findUnique({
      where: { id },
      select: { id: true, title: true },
    });

    if (!factCheck) {
      return NextResponse.json({ error: "Fact-check non trouve" }, { status: 404 });
    }

    const politician = await db.politician.findUnique({
      where: { id: body.politicianId },
      select: { id: true, fullName: true, slug: true },
    });

    if (!politician) {
      return NextResponse.json({ error: "Politicien non trouve" }, { status: 404 });
    }

    // Check if mention already exists
    const existing = await db.factCheckMention.findUnique({
      where: {
        factCheckId_politicianId: {
          factCheckId: id!,
          politicianId: body.politicianId,
        },
      },
    });

    if (existing) {
      return NextResponse.json({ error: "Mention deja existante" }, { status: 409 });
    }

    const mention = await db.factCheckMention.create({
      data: {
        factCheckId: id!,
        politicianId: body.politicianId,
        matchedName: politician.fullName,
        isClaimant: body.isClaimant,
      },
    });

    const { ip, userAgent } = getRequestMeta(request);
    await db.auditLog.create({
      data: {
        action: "CREATE",
        entityType: "FactCheckMention",
        entityId: mention.id,
        changes: {
          factCheck: factCheck.title,
          politician: politician.fullName,
          isClaimant: body.isClaimant,
        },
        ipAddress: ip,
        userAgent,
      },
    });

    invalidateEntity("factcheck");
    invalidateEntity("politician", politician.slug);
    await requestProfileRefresh({ politicianIds: [politician.id] }, "admin:mention-fact-check");

    return NextResponse.json(mention, { status: 201 });
  })
);
