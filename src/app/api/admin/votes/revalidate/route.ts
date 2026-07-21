import { NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation } from "@/lib/security/validate";
import { revalidateVotesSchema } from "@/lib/security/schemas";
import { db } from "@/lib/db";
import { revalidatePublicForScrutin } from "@/lib/votes/revalidate-public";
import { partitionRevalidatable } from "./partition";

/**
 * POST /api/admin/votes/revalidate
 *
 * Bulk-revalidate the public vote pages for a set of scrutins after their
 * policy titles were approved out-of-band (daily auto-approve cron, or a
 * cloud SQL routine), neither of which triggers Next.js revalidation on
 * their own. Only scrutins whose policy title is APPROVED are revalidated;
 * everything else is reported back as skipped. Capped at 200 ids per call
 * (see revalidateVotesSchema) since each id can trigger several
 * revalidatePath calls inline in the request.
 * Body: { scrutinIds: string[] }
 */
export const POST = withAdminAuth(
  withValidation(revalidateVotesSchema, async (_request, _context, body) => {
    const ids = Array.from(new Set(body.scrutinIds));

    const rows = await db.scrutin.findMany({
      where: { id: { in: ids } },
      select: { id: true, policyTitle: { select: { status: true } } },
    });

    const { toRevalidate, skipped } = partitionRevalidatable(
      ids,
      rows.map((row) => ({ id: row.id, status: row.policyTitle?.status ?? null }))
    );

    for (const scrutinId of toRevalidate) {
      await revalidatePublicForScrutin(scrutinId);
    }

    await db.auditLog.create({
      data: {
        action: "INVALIDATE",
        entityType: "Scrutin",
        entityId: `${toRevalidate.length} scrutins`,
        changes: { revalidated: toRevalidate, skipped },
      },
    });

    return NextResponse.json({ revalidated: toRevalidate, skipped });
  })
);
