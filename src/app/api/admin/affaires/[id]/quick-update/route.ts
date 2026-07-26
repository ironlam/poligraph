import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation, getRequestMeta } from "@/lib/security";
import { quickUpdateAffairSchema } from "@/lib/security/schemas/affair";
import { invalidateEntity, invalidateAffectedPoliticians } from "@/lib/cache";
import { trackStatusChange } from "@/services/affairs/status-tracking";
import {
  assertPublishable,
  PublishGuardError,
  VERIFIED_BY_MODERATION,
  PUBLISHED_STATUS,
} from "@/lib/affairs/publish-guard";
import type { AffairStatus } from "@/generated/prisma";
import type { z } from "zod/v4";

type QuickUpdateBody = z.infer<typeof quickUpdateAffairSchema>;

export const PATCH = withAdminAuth(
  withValidation(quickUpdateAffairSchema, async (request, context, body: QuickUpdateBody) => {
    const { id } = await context.params;

    const affair = await db.affair.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        involvement: true,
        slug: true,
        politicianId: true,
        publicationStatus: true,
        politician: { select: { slug: true } },
      },
    });

    if (!affair) {
      return NextResponse.json({ error: "Affaire non trouvée" }, { status: 404 });
    }

    const updateData: Record<string, string> = {};

    if (body.involvement !== undefined) {
      updateData.involvement = body.involvement;
    }
    if (body.status !== undefined) {
      updateData.status = body.status;
    }
    if (body.severity !== undefined) {
      updateData.severity = body.severity;
    }
    // RGPD art. 10 : la transition vers PUBLISHED passe exclusivement par le
    // guard ; les dépublications restent des écritures directes.
    if (body.publicationStatus !== undefined && body.publicationStatus !== PUBLISHED_STATUS) {
      updateData.publicationStatus = body.publicationStatus;
    }
    const wantsPublish =
      body.publicationStatus === PUBLISHED_STATUS && affair.publicationStatus !== PUBLISHED_STATUS;

    if (Object.keys(updateData).length === 0 && !wantsPublish) {
      return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 });
    }

    // Track status change if applicable
    if (updateData.status && updateData.status !== affair.status) {
      await trackStatusChange(affair.id, affair.status, updateData.status as AffairStatus, {
        type: "MANUAL",
        title: "Modification manuelle depuis l'admin",
      });
    }

    const meta = getRequestMeta(request);
    let updated;

    if (wantsPublish) {
      // Publish path, unchanged: the guard owns verifiedAt/verifiedBy and must
      // run after the field edits of the same request, so its audit row can only
      // be written once the guard has accepted.
      if (Object.keys(updateData).length > 0) {
        updated = await db.affair.update({ where: { id }, data: updateData });
      }

      try {
        await assertPublishable(id!, { verifiedBy: VERIFIED_BY_MODERATION });
      } catch (err) {
        if (err instanceof PublishGuardError) {
          return NextResponse.json(
            {
              error: "Affaire non publiable",
              reasons: err.reasons.map((r) => r.message),
            },
            { status: 422 }
          );
        }
        throw err;
      }

      await db.auditLog.create({
        data: {
          action: "UPDATE",
          entityType: "Affair",
          entityId: id!,
          changes: {
            ...updateData,
            publicationStatus: PUBLISHED_STATUS,
            verifiedBy: VERIFIED_BY_MODERATION,
          },
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
        },
      });
    } else {
      // Depublication and field edits: the row and its audit trail commit
      // together. A half-applied change would leave the affair altered with no
      // trace, and the invalidation below would advertise a state that the audit
      // log cannot account for (#572).
      const [row] = await db.$transaction([
        db.affair.update({ where: { id }, data: updateData }),
        db.auditLog.create({
          data: {
            action: "UPDATE",
            entityType: "Affair",
            entityId: id!,
            changes: updateData,
            ipAddress: meta.ip,
            userAgent: meta.userAgent,
          },
        }),
      ]);
      updated = row;
    }

    if (!updated) {
      updated = await db.affair.findUnique({ where: { id } });
    }

    // Only past the commit. Purging "affairs" also regenerates the sitemap
    // shards that announce this URL (#572).
    invalidateEntity("affair", affair.slug);
    invalidateAffectedPoliticians([affair.politician?.slug]);

    return NextResponse.json(updated);
  })
);
