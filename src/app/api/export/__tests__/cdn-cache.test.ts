import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The four CSV exports are the heaviest public routes: each one scans a whole
 * table and, being `force-dynamic`, used to reach the function on every call.
 * They now declare a CDN policy, and a route that silently loses it costs real
 * money without failing anything else. Route tests elsewhere stub `withCache`
 * to identity, so nothing would catch it: this file deliberately does not.
 *
 * Every route issues a single `findMany`; an empty result is enough to reach
 * the response, which is all this file asserts on.
 */
vi.mock("@/lib/db", () => ({
  db: {
    affair: { findMany: vi.fn().mockResolvedValue([]) },
    scrutin: { findMany: vi.fn().mockResolvedValue([]) },
    politician: { findMany: vi.fn().mockResolvedValue([]) },
    factCheck: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

const ROUTES = [
  ["affaires", () => import("@/app/api/export/affaires/route")],
  ["votes", () => import("@/app/api/export/votes/route")],
  ["politiques", () => import("@/app/api/export/politiques/route")],
  ["factchecks", () => import("@/app/api/export/factchecks/route")],
] as const;

describe("politique de cache CDN des exports CSV", () => {
  it.each(ROUTES)("/api/export/%s serves a cacheable CSV", async (name, load) => {
    const { GET } = await load();
    const response = await GET(new NextRequest(`https://poligraph.fr/api/export/${name}`), {
      params: Promise.resolve({}),
    });

    // Asserted first so a broken mock reads as a broken mock, not as a cache bug.
    expect(response.status).toBe(200);

    const cacheControl = response.headers.get("Cache-Control");
    expect(cacheControl).toContain("public");
    expect(cacheControl).toContain("s-maxage=3600");
    expect(cacheControl).not.toContain("no-cache");
    expect(cacheControl).not.toContain("no-store");
  });
});
