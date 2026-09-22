import { revalidatePath, revalidateTag, updateTag } from "next/cache";
import { after } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { ALL_TAGS } from "@/lib/cache-tags";
import { EXPORT_CACHE_TAGS, EXPORT_ROLLUP_TAG } from "@/lib/api/export-cache-tags";

// ─── Cache tiers for API responses ────────────────────────────────

export type CacheTier = "static" | "daily" | "stats" | "export" | "none";

const CACHE_HEADERS: Record<CacheTier, string> = {
  static: "public, s-maxage=3600, stale-while-revalidate=600",
  daily: "public, s-maxage=300, stale-while-revalidate=120",
  stats: "public, s-maxage=900, stale-while-revalidate=300",
  // 24h fresh, 7d served stale while revalidating. Aligned on the 04:00 daily
  // sync; admin writes do not wait for it, they purge by tag (see invalidateEntity).
  export: "public, s-maxage=86400, stale-while-revalidate=604800",
  none: "no-store",
};

/**
 * Set Cache-Control headers on a NextResponse.
 * Only call on successful (2xx) responses.
 *
 * `tags` attaches a `Vercel-Cache-Tag` so the entry can be purged on demand.
 */
export function withCache(response: Response, tier: CacheTier, tags?: readonly string[]): Response {
  response.headers.set("Cache-Control", CACHE_HEADERS[tier]);

  // The export routes are `force-dynamic`, where the client-facing Cache-Control
  // is not what the Vercel edge reads. This header is the authoritative one.
  if (tier === "export") {
    response.headers.set("Vercel-CDN-Cache-Control", CACHE_HEADERS[tier]);
  }

  if (tags?.length) {
    const offender = tags.find((tag) => tag.includes(","));
    if (offender) {
      throw new Error(`Tag de cache invalide (contient une virgule) : ${offender}`);
    }
    response.headers.set("Vercel-Cache-Tag", tags.join(","));
  }

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
 * Purge one export tag at the edge.
 *
 * Hard delete, not invalidate: called with no options, `dangerouslyDeleteByTag` defaults
 * `revalidationDeadlineSeconds` to 0 (immediate delete). `invalidateByTag`, and
 * `dangerouslyDeleteByTag` given a non-zero deadline, both keep serving the stale entry
 * for that window while revalidating in the background, and serving a depublished affair
 * one more time is exactly what this guards against (AGENTS.md, principe 9).
 *
 * Scheduled through `after()` so it never delays the response, and swallowed so a purge
 * outage cannot fail the write it follows. A failed purge call stays loud (console +
 * Sentry): an unreported one means a depublication that never reached the CDN. `after()`
 * itself throwing outside a request scope (a script, an offline job) is a normal case
 * with no edge to purge, and is swallowed silently on purpose, not reported.
 *
 * A successful purge is also logged, on purpose: `dangerouslyDeleteByTag` resolves
 * silently when the platform exposes no purge API (see `node_modules/@vercel/functions/
 * purge/index.js`), so an absence of errors here proves nothing happened. Only the
 * positive trace below lets a runbook tell "purged" apart from "never ran".
 *
 * `@vercel/functions` is imported dynamically: 38 route files import this module, and a
 * top-level import would pull the package into every test that touches them.
 */
function purgeExportTag(tag: string): void {
  // No VERCEL env: local dev, tests, one-off scripts. There is no edge to purge.
  if (!process.env.VERCEL) return;

  try {
    after(async () => {
      try {
        const { dangerouslyDeleteByTag } = await import("@vercel/functions");
        await dangerouslyDeleteByTag(tag);
        // Positive trace on purpose: the helper resolves silently when the platform does not
        // expose its purge API, so an absence of errors proves nothing. Only this line does.
        // eslint-disable-next-line no-console -- deliberate ops signal (Vercel logs)
        console.log(`[cache] purge du tag ${tag} demandée`);
      } catch (error) {
        // eslint-disable-next-line no-console -- deliberate ops signal (Vercel logs)
        console.error(`[cache] purge du tag ${tag} échouée`, error);
        Sentry.captureException(error, { tags: { purgeTag: tag } });
      }
    });
  } catch {
    // `after()` throws outside a request scope (a script, an offline job). Nothing to
    // schedule there, and the caller's mutation must not fail because of it.
  }
}

/**
 * Entities whose writes make one or more CSV exports stale.
 *
 * Deliberately not one-to-one, because the exports embed each other. Verified against the
 * route selects: the politiques export counts published affairs and public factcheck
 * mentions and serializes `currentParty`; the affaires export serializes the politician,
 * their `currentParty` and the `partyAtTime`; the factchecks export serializes the
 * mentioned politician and their `currentParty`. Only the votes export stands alone.
 *
 * Mapping an entity to its same-named export only would leave a renamed party visible in
 * three public CSV files for the whole 24h tier.
 */
const EXPORT_TAGS_BY_ENTITY: Partial<Record<EntityType, readonly string[]>> = {
  affair: [EXPORT_CACHE_TAGS.affairs, EXPORT_CACHE_TAGS.politicians],
  politician: [
    EXPORT_CACHE_TAGS.politicians,
    EXPORT_CACHE_TAGS.affairs,
    EXPORT_CACHE_TAGS.factchecks,
  ],
  party: [EXPORT_CACHE_TAGS.politicians, EXPORT_CACHE_TAGS.affairs, EXPORT_CACHE_TAGS.factchecks],
  factcheck: [EXPORT_CACHE_TAGS.factchecks, EXPORT_CACHE_TAGS.politicians],
  vote: [EXPORT_CACHE_TAGS.votes],
};

/**
 * Invalidate CDN cache and data cache for a given entity.
 * Call after admin mutations or sync operations.
 */
export function invalidateEntity(
  type: EntityType,
  slug?: string,
  options: InvalidateOptions = {}
): void {
  for (const exportTag of EXPORT_TAGS_BY_ENTITY[type] ?? []) {
    purgeExportTag(exportTag);
  }

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
      revalidateTag("affair-duplicates", DEFAULT_PROFILE);
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
  // The sync path never goes through `invalidateEntity`, so the exports would otherwise
  // stay cached for the full 24h tier after each daily sync.
  purgeExportTag(EXPORT_ROLLUP_TAG);
}

/**
 * Cache tags whose refresh also makes CSV exports stale.
 *
 * Same cross-entity dependencies as `EXPORT_TAGS_BY_ENTITY`, keyed by cache tag name
 * instead of entity type. The two vocabularies differ (`parties` here, `party` there), so
 * the tables stay separate; a test asserts they describe the same dependencies.
 */
const EXPORT_TAGS_BY_CACHE_TAG: Record<string, readonly string[]> = {
  affairs: [EXPORT_CACHE_TAGS.affairs, EXPORT_CACHE_TAGS.politicians],
  politicians: [
    EXPORT_CACHE_TAGS.politicians,
    EXPORT_CACHE_TAGS.affairs,
    EXPORT_CACHE_TAGS.factchecks,
  ],
  parties: [EXPORT_CACHE_TAGS.politicians, EXPORT_CACHE_TAGS.affairs, EXPORT_CACHE_TAGS.factchecks],
  factchecks: [EXPORT_CACHE_TAGS.factchecks, EXPORT_CACHE_TAGS.politicians],
  votes: [EXPORT_CACHE_TAGS.votes],
};

/**
 * Revalidate specific tags by name. Defaults to the "minutes" cacheLife
 * profile; pass `profile` to override for slow-changing data.
 */
export function revalidateTags(tags: string[], profile: string = DEFAULT_PROFILE): void {
  for (const tag of tags) {
    revalidateTag(tag, profile);
  }

  // The daily sync refreshes through this function, never through `invalidateEntity`
  // (scripts/sync-daily.ts posts tags to /api/cron/revalidate). Without this, an export
  // would stay cached for the full 24h tier after each sync.
  // Deduplicated: a sync posting several tags that share an export must purge it once.
  const exportTags = new Set(tags.flatMap((tag) => EXPORT_TAGS_BY_CACHE_TAG[tag] ?? []));
  for (const exportTag of exportTags) {
    purgeExportTag(exportTag);
  }
}

/** Immediate, read-your-write tag refresh. Server-Action context only.
 *  updateTag takes ONLY a tag (no cacheLife profile), unlike revalidateTag.
 *
 *  Does not purge any export: none of this function's callers (the policy-titles Server
 *  Actions) write a field a CSV export currently exposes. Harmless today, but it will need
 *  wiring into `purgeExportTag` the day a CSV export exposes a field written through this
 *  path (e.g. votes.csv exposing the editorialised policy title instead of the raw one). */
export function updateTags(tags: string[]): void {
  for (const tag of tags) updateTag(tag);
}
