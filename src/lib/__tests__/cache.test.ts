import { describe, it, expect, vi, beforeEach } from "vitest";

const updateTag = vi.fn();
const revalidateTag = vi.fn();
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidateTag: (...args: unknown[]) => revalidateTag(...args),
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
  updateTag: (...args: unknown[]) => updateTag(...args),
}));

import { updateTags, invalidateAffectedPoliticians, withCache } from "@/lib/cache";

describe("updateTags", () => {
  beforeEach(() => updateTag.mockClear());
  it("calls updateTag once per tag, with no profile arg", () => {
    updateTags(["votes", "dossiers"]);
    expect(updateTag).toHaveBeenCalledTimes(2);
    expect(updateTag).toHaveBeenNthCalledWith(1, "votes");
    expect(updateTag).toHaveBeenNthCalledWith(2, "dossiers");
  });
});

describe("invalidateAffectedPoliticians", () => {
  beforeEach(() => revalidateTag.mockClear());
  it("invalidates each distinct politician once and skips falsy slugs", () => {
    invalidateAffectedPoliticians(["a", "a", null, undefined, "b"]);
    const politicianTags = revalidateTag.mock.calls
      .map((c) => c[0])
      .filter((t) => String(t).startsWith("politician:"));
    expect(politicianTags).toEqual(["politician:a", "politician:b"]);
  });
});

describe("withCache", () => {
  it("serves the export tier for 24h and repeats it in the Vercel-authoritative header", () => {
    const response = withCache(new Response("a,b"), "export");
    const expected = "public, s-maxage=86400, stale-while-revalidate=604800";
    expect(response.headers.get("Cache-Control")).toBe(expected);
    expect(response.headers.get("Vercel-CDN-Cache-Control")).toBe(expected);
  });

  it("leaves the Vercel-authoritative header alone for the JSON tiers", () => {
    const response = withCache(new Response("{}"), "daily");
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=120"
    );
    expect(response.headers.get("Vercel-CDN-Cache-Control")).toBeNull();
  });

  it("joins tags with a comma, the separator Vercel expects", () => {
    const response = withCache(new Response("a,b"), "export", ["export:affairs", "exports"]);
    expect(response.headers.get("Vercel-Cache-Tag")).toBe("export:affairs,exports");
  });

  it("omits the tag header when no tag is given", () => {
    const response = withCache(new Response("{}"), "daily");
    expect(response.headers.get("Vercel-Cache-Tag")).toBeNull();
  });

  it("refuses a tag containing a comma, which Vercel would read as two tags", () => {
    expect(() => withCache(new Response("a"), "export", ["bad,tag"])).toThrow(/virgule/);
  });
});
