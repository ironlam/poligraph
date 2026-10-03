import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation } from "@/lib/security/validate";
import { bulkAffairSchema } from "@/lib/security/schemas/affair";
import { invalidateEntity, invalidateAffectedPoliticians } from "@/lib/cache";
import { closeModerationReviews } from "@/lib/affairs/close-moderation-reviews";
import { refreshProfilesForModeration } from "@/lib/politicians/profile-snapshot/moderation";
import { resolveProfileTargets } from "@/lib/politicians/profile-snapshot/request";
import {
  assertPublishable,
  PublishGuardError,
  VERIFIED_BY_MODERATION,
  PUBLISHED_STATUS,
} from "@/lib/affairs/publish-guard";
import type { z } from "zod/v4";

type BulkBody = z.infer<typeof bulkAffairSchema>;

export const POST = withAdminAuth(
  withValidation(bulkAffairSchema, async (_request, _context, body: BulkBody) => {
    const { ids, action, value } = body;
    const rejectionReason = typeof value === "string" ? value : undefined;

    // Capture affected politicians BEFORE mutating (required for delete, where
    // the rows disappear) so their profiles are invalidated too.
    const affected = await db.affair.findMany({
      where: { id: { in: ids } },
      select: { id: true, publicationStatus: true, politician: { select: { slug: true } } },
    });
    const politicianSlugs = affected.map((a) => a.politician.slug);
    // Profiles showing one of these affairs right now: rejecting or deleting it is the
    // privacy-critical case that stays synchronous even on a large batch. Resolved before the
    // write, while the rows and their links still exist.
    const publishedIds = affected
      .filter((a) => a.publicationStatus === "PUBLISHED")
      .map((a) => a.id);
    const privacyCriticalPoliticianIds =
      action === "publish" || publishedIds.length === 0
        ? []
        : await resolveProfileTargets({ affairIds: publishedIds });

    if (action === "delete") {
      // Resolved before the delete: the rows and their links disappear with it.
      const profileTargets = await resolveProfileTargets({ affairIds: ids });
      const result = await db.affair.deleteMany({
        where: { id: { in: ids } },
      });

      await db.auditLog.createMany({
        data: ids.map((id) => ({
          action: "DELETE" as const,
          entityType: "Affair",
          entityId: id,
          changes: { bulkDelete: true },
        })),
      });

      // Pas de closeModerationReviews ici : ModerationReview est en
      // onDelete: Cascade, les revues partent avec l'affaire.
      invalidateEntity("affair");
      invalidateAffectedPoliticians(politicianSlugs);
      await refreshProfilesForModeration(
        { politicianIds: profileTargets },
        "admin:affaires-supprimées-en-lot",
        { privacyCriticalPoliticianIds }
      );

      return NextResponse.json({ deleted: result.count });
    }

    if (action === "publish") {
      // RGPD art. 10 : publication uniquement via le guard.
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
            changes: { publicationStatus: PUBLISHED_STATUS, verifiedBy: VERIFIED_BY_MODERATION },
          })),
        });
        await closeModerationReviews(published, VERIFIED_BY_MODERATION);
        invalidateEntity("affair");
        invalidateAffectedPoliticians(politicianSlugs);
        await refreshProfilesForModeration(
          { affairIds: published },
          "admin:affaires-publiées-en-lot"
        );
      }

      return NextResponse.json({ updated: published.length, failed });
    }

    // action === "reject"
    const result = await db.affair.updateMany({
      where: { id: { in: ids } },
      data: {
        publicationStatus: "REJECTED",
        ...(rejectionReason ? { rejectionReason } : {}),
      },
    });

    // Audit log for each
    await db.auditLog.createMany({
      data: ids.map((id) => ({
        action: "UPDATE" as const,
        entityType: "Affair",
        entityId: id,
        changes: { publicationStatus: "REJECTED", ...(rejectionReason ? { rejectionReason } : {}) },
      })),
    });

    await closeModerationReviews(ids, VERIFIED_BY_MODERATION);
    invalidateEntity("affair");
    invalidateAffectedPoliticians(politicianSlugs);
    await refreshProfilesForModeration({ affairIds: ids }, "admin:affaires-rejetées-en-lot", {
      privacyCriticalPoliticianIds,
    });

    return NextResponse.json({ updated: result.count });
  })
);
