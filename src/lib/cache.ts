import { revalidatePath, revalidateTag, updateTag } from "next/cache";
import { ALL_TAGS } from "@/lib/cache-tags";

// ─── Cache tiers for API responses ────────────────────────────────

export type CacheTier = "static" | "daily" | "stats" | "none";

const CACHE_HEADERS: Record<CacheTier, string> = {
  static: "public, s-maxage=3600, stale-while-revalidate=600",
  daily: "public, s-maxage=300, stale-while-revalidate=120",
  stats: "public, s-maxage=900, stale-while-revalidate=300",
  none: "no-store",
};

/**
 * Set Cache-Control headers on a NextResponse.
 * Only call on successful (2xx) responses.
 */
export function withCache(response: Response, tier: CacheTier): Response {
  response.headers.set("Cache-Control", CACHE_HEADERS[tier]);
  return response;
}

// ─── Entity-based invalidation ────────────────────────────────────

export type EntityType =
  | "politician"
  | "party"
  | "affair"
  | "mandate"
  | "vote"
  | "dossier"
  | "factcheck"
  | "stats"
  | "election"
  | "election-2026";

export interface InvalidateOptions {
  /**
   * For type="mandate" only.
   * - true (default): also purges the "politicians" tag and deputy-by-X paths.
   *   Use for CREATE/DELETE mandates and for PUT on isCurrent transitions.
   * - false: only invalidates the mandate-specific routes. Use for URL-only
   *   PATCH operations and other no-op-for-listings updates.
   */
  affectsListings?: boolean;
}

// Next 16 requires a cacheLife profile as the second arg to revalidateTag.
// "minutes" matches the default cacheLife used across the codebase; "hours"
// matches election pages where data only flips on election day.
const DEFAULT_PROFILE = "minutes";
const ELECTION_PROFILE = "hours";

/**
 * Invalidate CDN cache and data cache for a given entity.
 * Call after admin mutations or sync operations.
 */
export function invalidateEntity(
  type: EntityType,
  slug?: string,
  options: InvalidateOptions = {}
): void {
  switch (type) {
    case "politician":
      revalidatePath("/api/politiques", "layout");
      if (slug) {
        revalidatePath(`/api/politiques/${slug}`, "layout");
        revalidatePath(`/api/politiques/${slug}/votes`, "layout");
        revalidatePath(`/api/politiques/${slug}/affaires`, "layout");
        revalidatePath(`/api/politiques/${slug}/relations`, "layout");
        revalidatePath(`/api/politiques/${slug}/factchecks`, "layout");
        revalidateTag(`politician:${slug}`, DEFAULT_PROFILE);
      }
      revalidateTag("politicians", DEFAULT_PROFILE);
      break;

    case "party":
      revalidatePath("/api/partis", "layout");
      if (slug) {
        revalidatePath(`/api/partis/${slug}`, "layout");
        revalidateTag(`party:${slug}`, DEFAULT_PROFILE);
      }
      revalidateTag("parties", DEFAULT_PROFILE);
      break;

    case "affair":
      revalidatePath("/api/affaires", "layout");
      revalidatePath("/affaires", "layout");
      if (slug) {
        revalidatePath(`/api/affaires/${slug}`, "layout");
        revalidatePath(`/affaires/${slug}`);
      }
      revalidateTag("affairs", DEFAULT_PROFILE);
      break;

    case "mandate": {
      const affectsListings = options.affectsListings ?? true;
      if (affectsListings) {
        revalidatePath("/api/mandats", "layout");
        revalidatePath("/api/deputies/by-department", "layout");
        revalidatePath("/api/deputies/by-commune", "layout");
        revalidateTag("politicians", DEFAULT_PROFILE);
      }
      // No-listings path: nothing to invalidate beyond the audit log row.
      // Mandate URL/title/dates are not surfaced on any cached listing.
      break;
    }

    case "vote":
      revalidatePath("/api/votes", "layout");
      revalidateTag("votes", DEFAULT_PROFILE);
      break;

    case "factcheck":
      if (slug) {
        revalidateTag(`factcheck:${slug}`, DEFAULT_PROFILE);
      }
      revalidateTag("factchecks", DEFAULT_PROFILE);
      break;

    case "dossier":
      revalidateTag("dossiers", DEFAULT_PROFILE);
      break;

    case "stats":
      revalidatePath("/api/votes/stats", "layout");
      revalidatePath("/api/stats/departments", "layout");
      revalidateTag("stats", DEFAULT_PROFILE);
      break;

    case "election":
      revalidateTag("elections", ELECTION_PROFILE);
      break;

    case "election-2026":
      revalidateTag("elections-municipales-2026", ELECTION_PROFILE);
      break;
  }
}

/**
 * After an affair mutation, invalidate each affected politician profile so its
 * affairs list reflects the change (getPolitician is tagged `politician:<slug>`).
 * De-dupes and skips falsy slugs. Pair with invalidateEntity("affair", ...).
 */
export function invalidateAffectedPoliticians(slugs: Array<string | null | undefined>): void {
  const seen = new Set<string>();
  for (const slug of slugs) {
    if (slug && !seen.has(slug)) {
      seen.add(slug);
      invalidateEntity("politician", slug);
    }
  }
}

// ─── Global revalidation (post-sync) ─────────────────────────────

// Re-exported so existing call sites keep importing tags from here; the list
// itself lives in @/lib/cache-tags, shared with the request schemas.
export { ALL_TAGS, FROZEN_TAGS, SELECTABLE_TAGS } from "@/lib/cache-tags";
export type { CacheTag, SelectableCacheTag } from "@/lib/cache-tags";

/**
 * Purge all main cache tags. Call after full sync operations.
 */
export function revalidateAll(): void {
  for (const tag of ALL_TAGS) {
    revalidateTag(tag, tag === "elections" ? ELECTION_PROFILE : DEFAULT_PROFILE);
  }
}

/**
 * Revalidate specific tags by name. Defaults to the "minutes" cacheLife
 * profile; pass `profile` to override for slow-changing data.
 */
export function revalidateTags(tags: string[], profile: string = DEFAULT_PROFILE): void {
  for (const tag of tags) {
    revalidateTag(tag, profile);
  }
}

/** Immediate, read-your-write tag refresh. Server-Action context only.
 *  updateTag takes ONLY a tag (no cacheLife profile), unlike revalidateTag. */
export function updateTags(tags: string[]): void {
  for (const tag of tags) updateTag(tag);
}
