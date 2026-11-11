import { NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation } from "@/lib/security/validate";
import { revalidateVotesSchema } from "@/lib/security/schemas";
import { db } from "@/lib/db";
import { revalidatePublicPathsForScrutin, revalidateVotePage } from "@/lib/votes/revalidate-public";
import { revalidateTags } from "@/lib/cache";
import { requestProfileRefresh } from "@/lib/politicians/profile-snapshot/request";
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
 * Body: { scrutinIds: string[], scope?: "all" | "page" }
 * scope "page" revalidates only the detail page of each scrutin (no list, theme,
 * votes tag or voter profiles), for a text edit that needs no wider invalidation.
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

    if (body.scope === "page") {
      for (const scrutinId of toRevalidate) await revalidateVotePage(scrutinId);
    } else {
      for (const scrutinId of toRevalidate) await revalidatePublicPathsForScrutin(scrutinId);
    }
    if (body.scope !== "page" && toRevalidate.length > 0) {
      revalidateTags(["votes"], "max");
      // The approved titles also show in the "Derniers votes" of their voters' profiles.
      await requestProfileRefresh({ scrutinIds: toRevalidate }, "admin:votes-revalidés");
    }

    await db.auditLog.create({
      data: {
        action: "INVALIDATE",
        entityType: "Scrutin",
        entityId: `${toRevalidate.length} scrutins`,
        changes: { revalidated: toRevalidate, skipped, scope: body.scope },
      },
    });

    return NextResponse.json({ revalidated: toRevalidate, skipped, scope: body.scope });
  })
);
