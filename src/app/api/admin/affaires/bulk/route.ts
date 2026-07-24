import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation } from "@/lib/security/validate";
import { bulkAffairSchema } from "@/lib/security/schemas/affair";
import { invalidateEntity, invalidateAffectedPoliticians } from "@/lib/cache";
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
      select: { politician: { select: { slug: true } } },
    });
    const politicianSlugs = affected.map((a) => a.politician.slug);

    if (action === "delete") {
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

      invalidateEntity("affair");
      invalidateAffectedPoliticians(politicianSlugs);

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
        invalidateEntity("affair");
        invalidateAffectedPoliticians(politicianSlugs);
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

    invalidateEntity("affair");
    invalidateAffectedPoliticians(politicianSlugs);

    return NextResponse.json({ updated: result.count });
  })
);
