import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation, getRequestMeta } from "@/lib/security";
import { mergeAffairsSchema } from "@/lib/security/schemas/affair";
import { mergeAffairs } from "@/services/affairs/reconciliation";
import { invalidateEntity } from "@/lib/cache";
import type { z } from "zod/v4";

type MergeBody = z.infer<typeof mergeAffairsSchema>;

export const POST = withAdminAuth(
  withValidation(mergeAffairsSchema, async (request, _context, body: MergeBody) => {
    const { primaryId, secondaryId } = body;

    if (primaryId === secondaryId) {
      return NextResponse.json({ error: "Les deux affaires sont identiques" }, { status: 400 });
    }

    // Existence is checked here so the caller gets a 404 rather than a 500 from
    // the service, and the politician slug is needed for cache invalidation.
    const [primary, secondary] = await Promise.all([
      db.affair.findUnique({
        where: { id: primaryId },
        select: { id: true, politician: { select: { slug: true } } },
      }),
      db.affair.findUnique({ where: { id: secondaryId }, select: { id: true } }),
    ]);

    if (!primary || !secondary) {
      return NextResponse.json({ error: "Affaire(s) non trouvée(s)" }, { status: 404 });
    }

    const meta = getRequestMeta(request);
    const result = await mergeAffairs(primaryId, secondaryId, {
      audit: { ipAddress: meta.ip, userAgent: meta.userAgent },
    });

    // After the transaction commits, never before.
    invalidateEntity("affair");
    if (primary.politician?.slug) invalidateEntity("politician", primary.politician.slug);

    return NextResponse.json({ success: true, ...result });
  })
);
