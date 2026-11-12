import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * These CSV exports retain shared caching. Keep the real `withCache` here so
 * a change to the response headers is visible to this test.
 *
 * Every route issues a single `findMany`; an empty result is enough to reach
 * the response, which is all this file asserts on.
 */
vi.mock("@/lib/db", () => ({
  db: {
    scrutin: { findMany: vi.fn().mockResolvedValue([]) },
    factCheck: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

const ROUTES = [
  ["votes", () => import("@/app/api/export/votes/route")],
  ["factchecks", () => import("@/app/api/export/factchecks/route")],
] as const;

const EXPECTED_TAG: Record<string, string> = {
  votes: "export:votes",
  factchecks: "export:factchecks",
};

describe("politique de cache CDN des exports CSV", () => {
  it.each(ROUTES)("/api/export/%s serves a cacheable, purgeable CSV", async (name, load) => {
    const { GET } = await load();
    const response = await GET(new NextRequest(`https://poligraph.fr/api/export/${name}`), {
      params: Promise.resolve({}),
    });

    // Asserted first so a broken mock reads as a broken mock, not as a cache bug.
    expect(response.status).toBe(200);

    const expected = "public, s-maxage=86400, stale-while-revalidate=604800";
    expect(response.headers.get("Cache-Control")).toBe(expected);
    // The authoritative header for the edge on a `force-dynamic` route.
    expect(response.headers.get("Vercel-CDN-Cache-Control")).toBe(expected);

    // Without a tag the entry cannot be purged, which is the whole point here.
    const tags = response.headers.get("Vercel-Cache-Tag")?.split(",") ?? [];
    expect(tags).toContain(EXPECTED_TAG[name]);
    expect(tags).toContain("exports");
  });
});
