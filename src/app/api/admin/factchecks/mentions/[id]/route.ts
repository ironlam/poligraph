import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DataSource } from "@/generated/prisma";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { invalidateEntity } from "@/lib/cache";
import { requestProfileRefresh } from "@/lib/politicians/profile-snapshot/request";
import { getRequestMeta } from "@/lib/security/audit";
import { recordMentionBlock } from "@/lib/identity/mention-blocklist";
import { withValidation } from "@/lib/security/validate";
import { updateMentionSchema } from "@/lib/security/schemas";

export const DELETE = withAdminAuth(async (request: NextRequest, context) => {
  const { id } = await context.params;

  const mention = await db.factCheckMention.findUnique({
    where: { id },
    select: {
      id: true,
      matchedName: true,
      politicianId: true,
      politician: { select: { slug: true, fullName: true } },
      factCheck: { select: { title: true } },
    },
  });

  if (!mention) {
    return NextResponse.json({ error: "Mention non trouvée" }, { status: 404 });
  }

  await db.factCheckMention.delete({ where: { id } });

  // Record NOT_SAME decision so this false positive won't recur
  if (mention.matchedName) {
    await recordMentionBlock({
      sourceType: DataSource.FACTCHECK,
      matchedName: mention.matchedName,
      politicianId: mention.politicianId,
      politicianFullName: mention.politician.fullName,
      contextTitle: mention.factCheck.title,
      decidedBy: "admin:factcheck-unlink",
    });
  }

  const { ip, userAgent } = getRequestMeta(request);
  await db.auditLog.create({
    data: {
      action: "DELETE",
      entityType: "FactCheckMention",
      entityId: id!,
      changes: {
        politician: mention.politician.fullName,
        factCheck: mention.factCheck.title,
      },
      ipAddress: ip,
      userAgent,
    },
  });

  invalidateEntity("factcheck");
  invalidateEntity("politician", mention.politician.slug);
  await requestProfileRefresh(
    { politicianIds: [mention.politicianId] },
    "admin:mention-fact-check-retirée"
  );

  return NextResponse.json({ success: true });
});

export const PATCH = withAdminAuth(
  withValidation(updateMentionSchema, async (request, context, body) => {
    const { id } = await context.params;

    const mention = await db.factCheckMention.findUnique({
      where: { id },
      select: {
        id: true,
        isClaimant: true,
        politicianId: true,
        politician: { select: { fullName: true, slug: true } },
        factCheck: { select: { title: true } },
      },
    });

    if (!mention) {
      return NextResponse.json({ error: "Mention non trouvee" }, { status: 404 });
    }

    const updated = await db.factCheckMention.update({
      where: { id },
      data: { isClaimant: body.isClaimant },
    });

    const { ip, userAgent } = getRequestMeta(request);
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "FactCheckMention",
        entityId: id!,
        changes: {
          politician: mention.politician.fullName,
          factCheck: mention.factCheck.title,
          isClaimant: { from: mention.isClaimant, to: body.isClaimant },
        },
        ipAddress: ip,
        userAgent,
      },
    });

    invalidateEntity("factcheck");
    invalidateEntity("politician", mention.politician.slug);
    await requestProfileRefresh(
      { politicianIds: [mention.politicianId] },
      "admin:mention-fact-check-modifiée"
    );

    return NextResponse.json(updated);
  })
);
