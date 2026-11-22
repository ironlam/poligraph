import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation } from "@/lib/security/validate";
import { getRequestMeta } from "@/lib/security/audit";
import { z } from "zod/v4";

// `content` is the Bluesky text and may be emptied for an X-only post; `twitterContent: null`
// removes the X version. At least one text must remain, checked against the stored row.
const editSchema = z.object({
  content: z.string().max(500).optional(),
  twitterContent: z.string().max(4000).nullable().optional(),
  link: z.string().url().optional(),
});

export const PATCH = withAdminAuth(
  withValidation(editSchema, async (request, context, body) => {
    const { id } = await context.params;

    const post = await db.socialPost.findUnique({ where: { id } });
    if (!post) {
      return NextResponse.json({ error: "Post non trouvé" }, { status: 404 });
    }
    if (post.status !== "PENDING_REVIEW") {
      return NextResponse.json(
        { error: "Seuls les posts en attente peuvent être édités" },
        { status: 400 }
      );
    }

    const nextBluesky = (body.content ?? post.content).trim();
    let nextX = post.twitterContent;
    if (body.twitterContent !== undefined) nextX = body.twitterContent?.trim() || null;
    if (nextBluesky.length === 0 && !nextX) {
      return NextResponse.json({ error: "Au moins un texte est requis" }, { status: 400 });
    }

    const updated = await db.socialPost.update({
      where: { id },
      data: {
        content: nextBluesky,
        twitterContent: nextX,
        link: body.link ?? undefined,
      },
    });
    const meta = getRequestMeta(request);
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "SocialPost",
        entityId: id,
        changes: { content: nextBluesky, twitterContent: nextX },
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    return NextResponse.json({ post: updated });
  })
);
