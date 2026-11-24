import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { revalidateAll, revalidateTags } from "@/lib/cache";
import { SELECTABLE_TAGS, type SelectableCacheTag } from "@/lib/cache-tags";
import {
  profileReconcileRelaySchema,
  profileRefreshRelaySchema,
  revalidatePathsSchema,
} from "@/lib/security/schemas/admin";
import {
  inngestSend,
  PROFILE_RECONCILE_ACTIVE_EVENT,
  PROFILE_RECONCILE_EVENT,
  PROFILE_REFRESH_EVENT,
  requestActiveProfileReconcile,
  requestProfileReconcile,
  type InngestEventPayload,
} from "@/lib/politicians/profile-snapshot/events";

const CRON_ALLOWED_TAGS = SELECTABLE_TAGS;

// Tags whose sync may change a profile document: a reconcile pass follows their revalidation.
// `politicians` can touch any profile, so it gets the full pass. A vote or fact-check sync only
// changes the profiles of parliamentarians and of politicians a fact-check mentions.
const FULL_RECONCILE_TAG = "politicians";
const ACTIVE_RECONCILE_TAGS: readonly string[] = ["votes", "factchecks"];
type CronAllowedTag = SelectableCacheTag;

// Tags a caller may expire at once with `expireNow: true` (no stale entry served while the
// next request recomputes). « gouvernements »: its "use cache" entries are nested (the list of
// governments reads one entry per government), so a stale-while-revalidate recompute of the outer
// entry could rebuild it from inner entries not yet refreshed. « historical-group-positions »: the
// way to take a revoked run off the scrutin pages, where serving the stale entry once more is
// exactly what the revocation is meant to stop.
const EXPIRE_NOW_TAGS: readonly string[] = ["gouvernements", "historical-group-positions"];

/**
 * POST /api/cron/revalidate
 *
 * Invalidate Next.js cache after sync operations.
 * Protected by CRON_SECRET (same as other cron endpoints).
 *
 * Body: { tags: ["votes", "politicians"] } or { all: true }, and/or
 * { paths: ["/politiques/<slug>"] } (at most 10, profile and government paths only).
 * `expireNow: true` additionally expires the tags of EXPIRE_NOW_TAGS immediately.
 *
 * Or a profile-snapshot request relayed by a workflow, which has no Inngest event key:
 * { profileRefresh: { politicianIds, reason } } or { profileReconcile: { reason, active } }.
 * Such a body purges nothing.
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

    if (body.profileRefresh !== undefined || body.profileReconcile !== undefined) {
      return relayProfileRequest(body);
    }

    if (body.all) {
      // Deprecated: { all: true } purges every cache tag, including politicians
      // and stats which sync only a few times per day. Prefer { tags: [...] }
      // with the specific tags your sync touched.
      console.warn("[/api/cron/revalidate] { all: true } is deprecated; use scoped tags instead");
      revalidateAll();
      await requestProfileReconcile("cron:all");
      return NextResponse.json({ revalidated: "all", deprecated: true });
    }

    const hasPaths = body.paths !== undefined;
    const hasTags = Array.isArray(body.tags) && body.tags.length > 0;

    let revalidatedPaths: string[] | undefined;
    if (hasPaths) {
      const parsed = revalidatePathsSchema.safeParse(body.paths);
      if (!parsed.success) {
        return NextResponse.json(
          {
            error:
              "paths: 1 to 10 entries, /politiques/<slug> or /politiques/gouvernements[/<slug>]",
          },
          { status: 400 }
        );
      }
      revalidatedPaths = parsed.data;
    }

    if (hasTags) {
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

      // Paths first: a request mixing both applies the narrow purge before the tag one.
      for (const path of revalidatedPaths ?? []) revalidatePath(path);
      revalidateTags(tags);
      if (body.expireNow === true) {
        for (const tag of tags)
          if (EXPIRE_NOW_TAGS.includes(tag)) revalidateTag(tag, { expire: 0 });
      }
      if (tags.includes(FULL_RECONCILE_TAG)) {
        await requestProfileReconcile(`cron:${tags.join(",")}`);
      } else if (tags.some((tag: string) => ACTIVE_RECONCILE_TAGS.includes(tag))) {
        await requestActiveProfileReconcile(`cron:${tags.join(",")}`);
      }
      return NextResponse.json(
        revalidatedPaths ? { revalidated: tags, revalidatedPaths } : { revalidated: tags }
      );
    }

    if (revalidatedPaths) {
      for (const path of revalidatedPaths) revalidatePath(path);
      return NextResponse.json({ revalidatedPaths });
    }

    return NextResponse.json(
      { error: "Body must contain { all: true }, { tags: string[] } or { paths: string[] }" },
      { status: 400 }
    );
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
}

// Sent with `inngestSend`, not `defaultSend`: the latter relays to this very route when the
// event key is missing.
async function relayProfileRequest(body: {
  profileRefresh?: unknown;
  profileReconcile?: unknown;
}): Promise<NextResponse> {
  let events: InngestEventPayload[];
  if (body.profileRefresh !== undefined) {
    const parsed = profileRefreshRelaySchema.safeParse(body.profileRefresh);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "profileRefresh: { politicianIds: 1 to 100 ids, reason }" },
        { status: 400 }
      );
    }
    const { politicianIds, reason } = parsed.data;
    events = [...new Set(politicianIds)].map((politicianId) => ({
      name: PROFILE_REFRESH_EVENT,
      data: { politicianId, reason },
    }));
  } else {
    const parsed = profileReconcileRelaySchema.safeParse(body.profileReconcile);
    if (!parsed.success) {
      return NextResponse.json({ error: "profileReconcile: { reason, active }" }, { status: 400 });
    }
    const { reason, active } = parsed.data;
    events = [
      { name: active ? PROFILE_RECONCILE_ACTIVE_EVENT : PROFILE_RECONCILE_EVENT, data: { reason } },
    ];
  }

  try {
    await inngestSend(events);
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "[profile-snapshot] relay failed",
        count: events.length,
        error: error instanceof Error ? error.message : String(error),
      })
    );
    return NextResponse.json({ error: "Relay failed" }, { status: 502 });
  }
  return NextResponse.json({ relayed: events.length });
}
