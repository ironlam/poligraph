import type { SelectableCacheTag } from "@/lib/cache-tags";

/**
 * The cache tags each sitemap shard depends on.
 *
 * `src/app/sitemap.ts` declares these on its `"use cache"` entries so ordinary
 * entity invalidation reaches the sitemap. Without them the shards were
 * build-time artefacts: unpublishing an affair left its URL announced to
 * crawlers until the next deploy (#572).
 *
 * Keep in sync with the builders in `src/app/sitemap.ts`.
 */
export const SITEMAP_SHARD_TAGS = {
  // Static pages + indexable politicians. A profile can be indexable solely
  // because it carries a published affair or a fact-check, so those tags
  // belong here as much as "politicians" does.
  0: ["politicians", "affairs", "factchecks"],
  // Affair pages, party pages, elections, departments.
  1: ["affairs", "parties", "elections"],
  2: ["dossiers"],
  3: ["votes"],
  // Communes carrying a 2026 candidacy. Frozen data, hence the frozen tag.
  4: ["elections-municipales-2026"],
} as const satisfies Record<number, readonly SelectableCacheTag[]>;

/**
 * Shards an affair can appear in, directly or through the profile it keeps
 * indexable. Depublishing an affair must reach every one of them.
 */
export const AFFAIR_BEARING_SHARDS = [0, 1] as const;
