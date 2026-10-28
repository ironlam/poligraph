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

    // Le verrou de ligne sérialise les PUT concurrents : le garde de publication lit l'état
    // que l'update va réellement modifier.
    const result = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ChangelogEntry" WHERE id = ${id} FOR UPDATE`;
      const existing = await tx.changelogEntry.findUnique({ where: { id } });
      if (!existing) return { error: "Entrée introuvable", status: 404 } as const;

      const sourceUrl = body.sourceUrl !== undefined ? body.sourceUrl : existing.sourceUrl;
      const nextStatus = body.status ?? existing.status;
      if (nextStatus === "PUBLISHED" && !isChangelogPublishable({ sourceUrl })) {
        return {
          error: "Une entrée publiée doit garder un lien vers sa source",
          status: 422,
        } as const;
      }

      const entry = await tx.changelogEntry.update({
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
      return { entry } as const;
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const { entry } = result;

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
