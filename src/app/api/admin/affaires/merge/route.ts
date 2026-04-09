import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation, getRequestMeta } from "@/lib/security";
import { mergeAffairsSchema } from "@/lib/security/schemas/affair";
import { invalidateEntity } from "@/lib/cache";
import type { z } from "zod/v4";

type MergeBody = z.infer<typeof mergeAffairsSchema>;

export const POST = withAdminAuth(
  withValidation(mergeAffairsSchema, async (request, _context, body: MergeBody) => {
    const { primaryId, secondaryId } = body;

    if (primaryId === secondaryId) {
      return NextResponse.json({ error: "Les deux affaires sont identiques" }, { status: 400 });
    }

    const [primary, secondary] = await Promise.all([
      db.affair.findUnique({
        where: { id: primaryId },
        include: {
          sources: { select: { url: true } },
          politician: { select: { slug: true } },
        },
      }),
      db.affair.findUnique({
        where: { id: secondaryId },
        include: {
          sources: true,
          events: true,
        },
      }),
    ]);

    // Capture identifiers before mutation so we can build a redirect row
    // after the secondary affair is deleted. Any external citation pointing
    // at the retired poligraphId must keep resolving to the survivor.
    const secondaryPublicId = secondary?.publicId ?? null;
    const primaryPublicId = primary?.publicId ?? null;

    if (!primary || !secondary) {
      return NextResponse.json({ error: "Affaire(s) non trouvée(s)" }, { status: 404 });
    }

    const existingUrls = new Set(primary.sources.map((s) => s.url));

    // Move non-duplicate sources from secondary to primary
    const sourcesToMove = secondary.sources.filter((s) => !existingUrls.has(s.url));
    if (sourcesToMove.length > 0) {
      await db.source.updateMany({
        where: { id: { in: sourcesToMove.map((s) => s.id) } },
        data: { affairId: primaryId },
      });
    }

    // Move affair events from secondary to primary
    if (secondary.events.length > 0) {
      await db.affairEvent.updateMany({
        where: { affairId: secondaryId },
        data: { affairId: primaryId },
      });
    }

    // Move press article links from secondary to primary
    await db.pressArticleAffair.updateMany({
      where: { affairId: secondaryId },
      data: { affairId: primaryId },
    });

    // Merge judicial identifiers if primary is missing them
    const updates: Prisma.AffairUpdateInput = {};
    if (!primary.ecli && secondary.ecli) updates.ecli = secondary.ecli;
    if (!primary.pourvoiNumber && secondary.pourvoiNumber)
      updates.pourvoiNumber = secondary.pourvoiNumber;
    if (primary.caseNumbers.length === 0 && secondary.caseNumbers.length > 0)
      updates.caseNumbers = secondary.caseNumbers;
    if (!primary.court && secondary.court) updates.court = secondary.court;
    if (!primary.chamber && secondary.chamber) updates.chamber = secondary.chamber;
    if (!primary.caseNumber && secondary.caseNumber) updates.caseNumber = secondary.caseNumber;

    if (Object.keys(updates).length > 0) {
      await db.affair.update({
        where: { id: primaryId },
        data: updates,
      });
    }

    // Delete secondary affair (remaining sources will cascade)
    await db.affair.delete({ where: { id: secondaryId } });

    // Preserve the retired poligraphId as a redirect so external citations
    // keep resolving. Only write the redirect if both IDs exist and differ.
    if (secondaryPublicId && primaryPublicId && secondaryPublicId !== primaryPublicId) {
      await db.publicIdRedirect.upsert({
        where: { fromPublicId: secondaryPublicId },
        create: {
          fromPublicId: secondaryPublicId,
          toPublicId: primaryPublicId,
          entityType: "affair",
          reason: "merged",
        },
        update: {
          toPublicId: primaryPublicId,
          reason: "merged",
        },
      });
    }

    // Audit log
    const meta = getRequestMeta(request);
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "Affair",
        entityId: primaryId,
        changes: {
          merged: true,
          deletedAffairId: secondaryId,
          deletedAffairTitle: secondary.title,
          sourcesMoved: sourcesToMove.length,
          eventsMoved: secondary.events.length,
          identifiersMerged: Object.keys(updates),
        },
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    invalidateEntity("affair");
    if (primary.politician?.slug) invalidateEntity("politician", primary.politician.slug);

    return NextResponse.json({
      success: true,
      sourcesMoved: sourcesToMove.length,
      eventsMoved: secondary.events.length,
      identifiersMerged: Object.keys(updates),
    });
  })
);
