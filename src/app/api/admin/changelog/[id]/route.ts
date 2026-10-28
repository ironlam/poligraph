import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation, getRequestMeta } from "@/lib/security";
import { updateChangelogSchema } from "@/lib/security/schemas/changelog";
import { isChangelogPublishable } from "@/lib/changelog/publish-guard";
import { revalidateTags } from "@/lib/cache";
import type { z } from "zod/v4";

type UpdateChangelogBody = z.infer<typeof updateChangelogSchema>;

export const PUT = withAdminAuth(
  withValidation(updateChangelogSchema, async (request, context, body: UpdateChangelogBody) => {
    const { id } = await context.params;

    const existing = await db.changelogEntry.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Entrée introuvable" }, { status: 404 });
    }

    const sourceUrl = body.sourceUrl !== undefined ? body.sourceUrl : existing.sourceUrl;
    if (body.status === "PUBLISHED" && !isChangelogPublishable({ sourceUrl })) {
      return NextResponse.json(
        { error: "Une entrée ne peut être publiée qu'avec un lien vers sa source" },
        { status: 422 }
      );
    }

    const entry = await db.changelogEntry.update({
      where: { id },
      data: {
        ...(body.type !== undefined && { type: body.type }),
        ...(body.date !== undefined && { date: new Date(`${body.date}T00:00:00Z`) }),
        ...(body.title !== undefined && { title: body.title }),
        ...(body.body !== undefined && { body: body.body }),
        ...(body.sourceUrl !== undefined && { sourceUrl: body.sourceUrl }),
        ...(body.status !== undefined && { status: body.status }),
      },
    });

    const meta = getRequestMeta(request);
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "ChangelogEntry",
        entityId: id!,
        changes: body,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    revalidateTags(["changelog"]);

    return NextResponse.json({ ...entry, date: entry.date.toISOString().slice(0, 10) });
  })
);

export const DELETE = withAdminAuth(async (request, context) => {
  const { id } = await context.params;

  const existing = await db.changelogEntry.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Entrée introuvable" }, { status: 404 });
  }

  await db.changelogEntry.delete({ where: { id } });

  const meta = getRequestMeta(request);
  await db.auditLog.create({
    data: {
      action: "DELETE",
      entityType: "ChangelogEntry",
      entityId: id!,
      changes: { title: existing.title, status: existing.status },
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    },
  });

  revalidateTags(["changelog"]);

  return NextResponse.json({ success: true });
});
