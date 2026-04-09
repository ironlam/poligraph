import { revalidatePath, updateTag } from "next/cache";

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
        updateTag(`politician:${slug}`);
      }
      updateTag("politicians");
      break;

    case "party":
      revalidatePath("/api/partis", "layout");
      if (slug) {
        revalidatePath(`/api/partis/${slug}`, "layout");
        updateTag(`party:${slug}`);
      }
      updateTag("parties");
      break;

    case "affair":
      revalidatePath("/api/affaires", "layout");
      if (slug) {
        revalidatePath(`/api/affaires/${slug}`, "layout");
      }
      updateTag("affairs");
      break;

    case "mandate": {
      const affectsListings = options.affectsListings ?? true;
      if (affectsListings) {
        revalidatePath("/api/mandats", "layout");
        revalidatePath("/api/deputies/by-department", "layout");
        revalidatePath("/api/deputies/by-commune", "layout");
        updateTag("politicians");
      }
      // No-listings path: nothing to invalidate beyond the audit log row.
      // Mandate URL/title/dates are not surfaced on any cached listing.
      break;
    }

    case "vote":
      revalidatePath("/api/votes", "layout");
      updateTag("votes");
      break;

    case "factcheck":
      if (slug) {
        updateTag(`factcheck:${slug}`);
      }
      updateTag("factchecks");
      break;

    case "dossier":
      updateTag("dossiers");
      break;

    case "stats":
      revalidatePath("/api/votes/stats", "layout");
      revalidatePath("/api/stats/departments", "layout");
      updateTag("stats");
      break;

    case "election":
      updateTag("elections");
      break;

    case "election-2026":
      updateTag("elections-municipales-2026");
      break;
  }
}

// ─── Global revalidation (post-sync) ─────────────────────────────

export const ALL_TAGS = [
  "politicians",
  "parties",
  "affairs",
  "votes",
  "stats",
  "dossiers",
  "factchecks",
  "elections",
] as const;

export type CacheTag = (typeof ALL_TAGS)[number];

/**
 * Purge all main cache tags. Call after full sync operations.
 */
export function revalidateAll(): void {
  for (const tag of ALL_TAGS) {
    updateTag(tag);
  }
}

/**
 * Revalidate specific tags by name.
 */
export function revalidateTags(tags: string[]): void {
  for (const tag of tags) {
    updateTag(tag);
  }
}
