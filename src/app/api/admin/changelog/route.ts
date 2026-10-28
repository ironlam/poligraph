import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation, getRequestMeta } from "@/lib/security";
import { createChangelogSchema } from "@/lib/security/schemas/changelog";
import { revalidateTags } from "@/lib/cache";
import type { z } from "zod/v4";

type CreateChangelogBody = z.infer<typeof createChangelogSchema>;

const ADMIN_LIST_LIMIT = 200;

export const GET = withAdminAuth(async () => {
  const entries = await db.changelogEntry.findMany({
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: ADMIN_LIST_LIMIT,
  });

  return NextResponse.json(
    entries.map((entry) => ({ ...entry, date: entry.date.toISOString().slice(0, 10) }))
  );
});

// An entry is always created as a draft: publication is a separate, explicit PUT.
export const POST = withAdminAuth(
  withValidation(createChangelogSchema, async (request, _context, body: CreateChangelogBody) => {
    const entry = await db.changelogEntry.create({
      data: {
        type: body.type,
        date: new Date(`${body.date}T00:00:00Z`),
        title: body.title,
        body: body.body,
        sourceUrl: body.sourceUrl ?? null,
        status: "DRAFT",
      },
    });

    const meta = getRequestMeta(request);
    await db.auditLog.create({
      data: {
        action: "CREATE",
        entityType: "ChangelogEntry",
        entityId: entry.id,
        changes: body,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    revalidateTags(["changelog"]);

    return NextResponse.json(
      { ...entry, date: entry.date.toISOString().slice(0, 10) },
      { status: 201 }
    );
  })
);
