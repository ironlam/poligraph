import { beforeEach, describe, expect, it, vi } from "vitest";

// Shard 5 announces the Territoires section: the entry page, the 18 regions, and the communes the
// shared predicate keeps indexable. The SQL itself is guarded at the source level in
// indexation-doctrine.test.ts; this file checks what the shard does with the rows it reads.

const h = vi.hoisted(() => {
  const queryRaw = vi.fn();
  const fallback: ProxyHandler<Record<string, unknown>> = {
    get(_t, model: string) {
      if (model === "$queryRaw") return queryRaw;
      return new Proxy({}, { get: () => async () => [] });
    },
  };
  return { queryRaw, db: new Proxy({}, fallback), cacheTag: vi.fn() };
});

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/cache", () => ({ cacheTag: h.cacheTag, cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: h.db }));

import sitemap from "@/app/sitemap";
import { SITEMAP_SHARD_TAGS } from "@/lib/seo/sitemap-tags";
import { REGIONS } from "@/config/regions";

const shard5 = () => sitemap({ id: Promise.resolve("5") });
const path = (url: string) => url.replace(/^https?:\/\/[^/]+/, "");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sitemap : rubrique Territoires", () => {
  it("annonce l'entrée, la page des données, les 18 régions et les communes retenues", async () => {
    h.queryRaw.mockResolvedValueOnce([
      { id: "75056", lastmod: new Date("2026-10-01T00:00:00Z") },
      { id: "2A004", lastmod: new Date("2026-09-01T00:00:00Z") },
    ]);
    const urls = (await shard5()).map((e) => path(e.url));

    expect(urls[0]).toBe("/territoires");
    expect(REGIONS).toHaveLength(18);
    for (const region of REGIONS) expect(urls).toContain(`/territoires/regions/${region.slug}`);
    expect(urls).toContain("/territoires/communes/75056");
    expect(urls).toContain("/territoires/communes/2A004");
    expect(urls).toContain("/territoires/donnees");
    expect(urls).toHaveLength(2 + 3 + 18 + 2);
  });

  it("date chaque commune du dernier changement du mandat de son maire", async () => {
    h.queryRaw.mockResolvedValueOnce([
      { id: "75056", lastmod: new Date("2026-10-01T00:00:00Z") },
      { id: "13055", lastmod: new Date("2026-08-01T00:00:00Z") },
    ]);
    const entries = await shard5();
    const lastmod = (suffix: string) => entries.find((e) => e.url.endsWith(suffix))?.lastModified;
    expect(lastmod("/territoires/communes/13055")).toEqual(new Date("2026-08-01T00:00:00Z"));
    expect(lastmod("/territoires")).toEqual(new Date("2026-10-01T00:00:00Z"));
  });

  it("annonce la page des élections seulement pour une commune avec résultats, datée par eux", async () => {
    h.queryRaw.mockResolvedValueOnce([
      {
        id: "35238",
        lastmod: new Date("2026-10-01T00:00:00Z"),
        electionsLastmod: new Date("2026-10-12T00:00:00Z"),
      },
      { id: "13055", lastmod: new Date("2026-08-01T00:00:00Z"), electionsLastmod: null },
    ]);
    const entries = await shard5();
    const find = (suffix: string) => entries.find((e) => e.url.endsWith(suffix));
    expect(find("/territoires/communes/35238/elections")?.lastModified).toEqual(
      new Date("2026-10-12T00:00:00Z")
    );
    expect(find("/territoires/communes/13055/elections")).toBeUndefined();
    expect(find("/territoires/communes/13055")).toBeDefined();
  });

  it("garde l'entrée, la page des données et les régions sans aucune commune indexable", async () => {
    h.queryRaw.mockResolvedValueOnce([]);
    const urls = (await shard5()).map((e) => path(e.url));
    expect(urls).toHaveLength(2 + 3 + 18);
    expect(urls.some((u) => u.startsWith("/territoires/communes/"))).toBe(false);
  });

  it("passe le seuil et le statut public en paramètres, jamais en dur", async () => {
    h.queryRaw.mockResolvedValueOnce([]);
    await shard5();
    const sql = h.queryRaw.mock.calls[0]![0] as { values: unknown[] };
    expect(sql.values).toEqual(expect.arrayContaining(["PUBLISHED", 1000]));
  });

  it("se purge avec les profils et avec la rubrique", async () => {
    h.queryRaw.mockResolvedValueOnce([]);
    await shard5();
    expect(h.cacheTag).toHaveBeenCalledWith(...SITEMAP_SHARD_TAGS[5]);
    expect(SITEMAP_SHARD_TAGS[5]).toEqual(["politicians", "territoires", "elections"]);
  });
});

describe("sitemap : départements sous /territoires (#1052)", () => {
  it("annonce la liste et chaque département à leur nouvelle adresse, jamais l'ancienne", async () => {
    h.queryRaw.mockResolvedValue([]);
    const urls: string[] = [];
    for (const id of ["0", "1", "2", "3", "4", "5"]) {
      urls.push(...(await sitemap({ id: Promise.resolve(id) })).map((e) => path(e.url)));
    }

    expect(urls).toContain("/territoires/departements");
    expect(urls).toContain("/territoires/departements/ille-et-vilaine");
    expect(urls).toContain("/territoires/departements/polynesie-francaise");
    expect(urls.filter((u) => u.startsWith("/departements"))).toEqual([]);
  });
});
