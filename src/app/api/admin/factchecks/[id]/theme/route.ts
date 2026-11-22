import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { getRequestMeta } from "@/lib/security/audit";
import { withValidation } from "@/lib/security/validate";
import { validateFactcheckThemeSchema } from "@/lib/security/schemas";

/**
 * Validates the theme of a fact-check: the model's proposal as it is, or a correction, `null`
 * meaning "no theme". Sets `themeReviewedAt`, which the public block will require (lot 4c), and
 * writes the change to the audit log.
 *
 * No cache purge here, on purpose: the queue validates hundreds of fact-checks one click at a
 * time, and purging the `factchecks` tag on each click would regenerate every fact-check page
 * as many times. A validated theme reaches the public pages at their next regeneration.
 */
export const POST = withAdminAuth(
  withValidation(validateFactcheckThemeSchema, async (request, context, body) => {
    const { id } = await context.params;

    const factCheck = await db.factCheck.findUnique({
      where: { id },
      select: { id: true, theme: true, themeReviewedAt: true },
    });
    if (!factCheck) {
      return NextResponse.json({ error: "Fact-check non trouvé" }, { status: 404 });
    }

    const reviewedAt = new Date();
    await db.factCheck.update({
      where: { id },
      data: { theme: body.theme, themeReviewedAt: reviewedAt },
    });

    const { ip, userAgent } = getRequestMeta(request);
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "FactCheck",
        entityId: id!,
        changes: {
          theme: { from: factCheck.theme, to: body.theme },
          themeReviewedAt: { from: factCheck.themeReviewedAt, to: reviewedAt },
        },
        ipAddress: ip,
        userAgent,
      },
    });

    return NextResponse.json({ id, theme: body.theme, themeReviewedAt: reviewedAt });
  })
);
