import { NextRequest, NextResponse } from "next/server";
import { revalidateAll, revalidateTags } from "@/lib/cache";
import { SELECTABLE_TAGS, type SelectableCacheTag } from "@/lib/cache-tags";
import { requestProfileReconcile } from "@/lib/politicians/profile-snapshot/request";

const CRON_ALLOWED_TAGS = SELECTABLE_TAGS;

// Tags whose sync may change a profile document: a reconcile pass follows their revalidation.
const PROFILE_TAGS: readonly string[] = ["politicians", "votes", "factchecks"];
type CronAllowedTag = SelectableCacheTag;

/**
 * POST /api/cron/revalidate
 *
 * Invalidate Next.js cache after sync operations.
 * Protected by CRON_SECRET (same as other cron endpoints).
 *
 * Body: { tags: ["votes", "politicians"] } or { all: true }
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  // Verify authorization
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (body.all) {
      // Deprecated: { all: true } purges every cache tag, including politicians
      // and stats which sync only a few times per day. Prefer { tags: [...] }
      // with the specific tags your sync touched.
      console.warn("[/api/cron/revalidate] { all: true } is deprecated; use scoped tags instead");
      revalidateAll();
      await requestProfileReconcile("cron:all");
      return NextResponse.json({ revalidated: "all", deprecated: true });
    }

    if (Array.isArray(body.tags) && body.tags.length > 0) {
      const tags = body.tags.filter(
        (t: unknown): t is CronAllowedTag =>
          typeof t === "string" && (CRON_ALLOWED_TAGS as readonly string[]).includes(t)
      );

      if (tags.length === 0) {
        return NextResponse.json(
          { error: "No valid tags provided", allowed: CRON_ALLOWED_TAGS },
          { status: 400 }
        );
      }

      revalidateTags(tags);
      if (tags.some((tag: string) => PROFILE_TAGS.includes(tag))) {
        await requestProfileReconcile(`cron:${tags.join(",")}`);
      }
      return NextResponse.json({ revalidated: tags });
    }

    return NextResponse.json(
      { error: "Body must contain { all: true } or { tags: string[] }" },
      { status: 400 }
    );
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
}
