import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation } from "@/lib/security/validate";
import { moderateAffairSchema } from "@/lib/security/schemas/affair";
import { invalidateEntity, invalidateAffectedPoliticians } from "@/lib/cache";
import {
  assertPublishable,
  PublishGuardError,
  VERIFIED_BY_MODERATION,
  PUBLISHED_STATUS,
} from "@/lib/affairs/publish-guard";
import type { PublicationStatus } from "@/generated/prisma";
import type { z } from "zod/v4";

type ModerateBody = z.infer<typeof moderateAffairSchema>;

const ACTION_TO_STATUS: Record<Exclude<ModerateBody["action"], "publish">, PublicationStatus> = {
  exclude: "EXCLUDED",
  reject: "REJECTED",
  archive: "ARCHIVED",
};

// ─── GET: list pending moderation reviews ───────────────────────────

export const GET = withAdminAuth(async () => {
  const reviews = await db.moderationReview.findMany({
    where: { appliedAt: null },
    include: {
      affair: {
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          category: true,
          publicationStatus: true,
          politician: {
            select: {
              fullName: true,
              photoUrl: true,
              slug: true,
            },
          },
          sources: {
            select: {
              id: true,
              sourceType: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const stats = {
    total: reviews.length,
    publish: reviews.filter((r) => r.recommendation === "PUBLISH").length,
    reject: reviews.filter((r) => r.recommendation === "REJECT").length,
    needsReview: reviews.filter((r) => r.recommendation === "NEEDS_REVIEW").length,
  };

  return NextResponse.json({ reviews, stats });
});

// ─── POST: moderate affairs by changing publication status ───────────

export const POST = withAdminAuth(
  withValidation(moderateAffairSchema, async (_request, _context, body: ModerateBody) => {
    const { ids, action } = body;

    // Capture affected politicians before mutating, so their profiles
    // (tagged `politician:<slug>`) are invalidated too (not just "affairs").
    const affected = await db.affair.findMany({
      where: { id: { in: ids } },
      select: { politician: { select: { slug: true } } },
    });
    const politicianSlugs = affected.map((a) => a.politician.slug);

    if (action === "publish") {
      // RGPD art. 10 : la publication passe par le guard, qui exige sources
      // + rattachements validés et écrit verifiedAt/verifiedBy atomiquement.
      const published: string[] = [];
      const failed: Array<{ id: string; reasons: string[] }> = [];

      for (const id of ids) {
        try {
          await assertPublishable(id, { verifiedBy: VERIFIED_BY_MODERATION });
          published.push(id);
        } catch (err) {
          if (err instanceof PublishGuardError) {
            failed.push({ id, reasons: err.reasons.map((r) => r.message) });
          } else {
            throw err;
          }
        }
      }

      if (published.length > 0) {
        await db.auditLog.createMany({
          data: published.map((id) => ({
            action: "UPDATE" as const,
            entityType: "Affair",
            entityId: id,
            changes: {
              publicationStatus: PUBLISHED_STATUS,
              moderationAction: action,
              verifiedBy: VERIFIED_BY_MODERATION,
            },
          })),
        });
        invalidateEntity("affair");
        invalidateAffectedPoliticians(politicianSlugs);
      }

      return NextResponse.json({ updated: published.length, failed });
    }

    const publicationStatus = ACTION_TO_STATUS[action];

    const result = await db.affair.updateMany({
      where: { id: { in: ids } },
      data: { publicationStatus },
    });

    await db.auditLog.createMany({
      data: ids.map((id) => ({
        action: "UPDATE" as const,
        entityType: "Affair",
        entityId: id,
        changes: { publicationStatus, moderationAction: action },
      })),
    });

    invalidateEntity("affair");
    invalidateAffectedPoliticians(politicianSlugs);

    return NextResponse.json({ updated: result.count });
  })
);
