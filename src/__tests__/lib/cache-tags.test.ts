import { describe, it, expect, vi, beforeEach } from "vitest";

const revalidateTagSpy = vi.fn();
const revalidatePathSpy = vi.fn();

vi.mock("next/cache", () => ({
  revalidateTag: (tag: string, profile: string) => revalidateTagSpy(tag, profile),
  revalidatePath: (path: string, type: string) => revalidatePathSpy(path, type),
}));

import { invalidateEntity, revalidateAll, ALL_TAGS } from "@/lib/cache";
import { SELECTABLE_TAGS } from "@/lib/cache-tags";
import { SITEMAP_SHARD_TAGS, AFFAIR_BEARING_SHARDS } from "@/lib/seo/sitemap-tags";
import { revalidateCacheSchema } from "@/lib/security/schemas/admin";

// Clear the spies before EVERY test (all describes), so a test that fires a
// broad purge (e.g. revalidateAll) can't leak its tag calls into a later
// describe that reads the accumulated spy state.
beforeEach(() => {
  revalidateTagSpy.mockClear();
  revalidatePathSpy.mockClear();
});

describe("cache invalidation scopes", () => {
  it("invalidateEntity('election') updates only the global elections tag", () => {
    invalidateEntity("election");
    const tags = revalidateTagSpy.mock.calls.map((c) => c[0]);
    expect(tags).toContain("elections");
    expect(tags).not.toContain("elections-municipales-2026");
  });

  it("invalidateEntity('election-2026') updates only the municipales-2026 tag", () => {
    invalidateEntity("election-2026");
    const tags = revalidateTagSpy.mock.calls.map((c) => c[0]);
    expect(tags).toContain("elections-municipales-2026");
    expect(tags).not.toContain("elections");
  });

  it("revalidateAll does NOT touch elections-municipales-2026", () => {
    revalidateAll();
    const tags = revalidateTagSpy.mock.calls.map((c) => c[0]);
    expect(tags).not.toContain("elections-municipales-2026");
  });

  it("ALL_TAGS does not include the figées municipales tag", () => {
    expect(ALL_TAGS).not.toContain("elections-municipales-2026" as never);
  });

  it("passes a cacheLife profile as the second arg to revalidateTag", () => {
    invalidateEntity("politician", "marine-le-pen");
    for (const call of revalidateTagSpy.mock.calls) {
      expect(typeof call[1]).toBe("string");
      expect(call[1].length).toBeGreaterThan(0);
    }
  });
});

// #572: the admin allow-list and ALL_TAGS were two hand-copied arrays and had
// drifted. "affairs" was absent, so an operator could not purge affairs
// selectively and had to fall back on { all: true }.
describe("selective invalidation allow-list", () => {
  it("accepts the affairs tag", () => {
    expect(revalidateCacheSchema.safeParse({ tags: ["affairs"] }).success).toBe(true);
  });

  it("accepts every tag a full revalidation would purge", () => {
    for (const tag of ALL_TAGS) {
      expect(revalidateCacheSchema.safeParse({ tags: [tag] }).success).toBe(true);
    }
  });

  it("refuses per-entity tags, which are an internal naming scheme", () => {
    for (const tag of ["politician:marine-le-pen", "party:rn", "factcheck:x", "affair:y"]) {
      expect(revalidateCacheSchema.safeParse({ tags: [tag] }).success).toBe(false);
    }
  });

  it("refuses unknown tags and rejects a batch containing one", () => {
    expect(revalidateCacheSchema.safeParse({ tags: ["nope"] }).success).toBe(false);
    expect(revalidateCacheSchema.safeParse({ tags: ["affairs", "nope"] }).success).toBe(false);
    expect(revalidateCacheSchema.safeParse({ tags: [] }).success).toBe(false);
  });
});

// Narrow sub-tags let an operator refresh the key-votes hub / homepage without
// firing the global "votes" purge (which spans the whole site and once tripped
// the Vercel spend cap).
describe("narrow sub-tags (targeted hub/homepage refresh)", () => {
  it("are operator-selectable via the cache endpoint", () => {
    for (const tag of ["votes-key", "homepage"]) {
      expect(revalidateCacheSchema.safeParse({ tags: [tag] }).success).toBe(true);
    }
  });

  it("are NOT purged by revalidateAll — their parent tag covers them there", () => {
    revalidateAll();
    const tags = revalidateTagSpy.mock.calls.map((c) => c[0]);
    expect(tags).not.toContain("votes-key");
    expect(tags).not.toContain("homepage");
  });
});

describe("sitemap shards take part in tag invalidation", () => {
  it("declares only known tags, and at least one per shard", () => {
    const known = new Set<string>(SELECTABLE_TAGS);
    for (const [shard, tags] of Object.entries(SITEMAP_SHARD_TAGS)) {
      expect(tags.length, `shard ${shard} declares no tag`).toBeGreaterThan(0);
      for (const tag of tags) {
        expect(known.has(tag), `shard ${shard} declares unknown tag "${tag}"`).toBe(true);
      }
    }
  });

  // The non-obvious one: shard 0 lists politicians, and a profile can be
  // indexable for the sole reason that it carries a published affair.
  it("makes shard 0 depend on affairs, not just on politicians", () => {
    expect(SITEMAP_SHARD_TAGS[0]).toContain("affairs");
    expect(SITEMAP_SHARD_TAGS[1]).toContain("affairs");
  });

  it("purges every affair-bearing shard when an affair changes", () => {
    invalidateEntity("affair", "une-affaire");
    const purged = new Set(revalidateTagSpy.mock.calls.map((c) => c[0]));

    for (const shard of AFFAIR_BEARING_SHARDS) {
      const declared: readonly string[] = SITEMAP_SHARD_TAGS[shard];
      expect(
        declared.some((tag) => purged.has(tag)),
        `shard ${shard} declares [${declared.join(", ")}], none of which is purged`
      ).toBe(true);
    }
  });

  it("leaves unrelated shards alone", () => {
    invalidateEntity("affair", "une-affaire");
    const purged = new Set(revalidateTagSpy.mock.calls.map((c) => c[0]));

    for (const shard of [2, 3, 4] as const) {
      const declared: readonly string[] = SITEMAP_SHARD_TAGS[shard];
      expect(
        declared.some((tag) => purged.has(tag)),
        `shard ${shard} should not be regenerated by an affair change`
      ).toBe(false);
    }
  });
});
