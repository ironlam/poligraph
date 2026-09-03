import { describe, it, expect, vi, beforeEach } from "vitest";

// #572: the sitemap shards were served as static artefacts that tag invalidation
// could not reach, so a depublished affair stayed announced to crawlers. The
// route envelope must therefore render per request, while the builders keep
// their cached, tagged data. This test guards the pairing, not the wording:
// it calls the route and watches the order of the calls it makes.

const h = vi.hoisted(() => {
  const calls: string[] = [];
  const dbHandler: ProxyHandler<Record<string, unknown>> = {
    get(_t, model: string) {
      if (model === "$queryRaw" || model === "$queryRawUnsafe") {
        return async () => {
          calls.push(`db.${model}`);
          return [];
        };
      }
      return new Proxy(
        {},
        {
          get(_m, method: string) {
            return async () => {
              calls.push(`db.${model}.${method}`);
              return method === "findFirst" || method === "findUnique" ? null : [];
            };
          },
        }
      );
    },
  };
  return {
    calls,
    connection: vi.fn(async () => {
      calls.push("connection");
    }),
    cacheTag: vi.fn((...tags: string[]) => {
      calls.push(`cacheTag(${tags.join(",")})`);
    }),
    cacheLife: vi.fn((profile: string) => {
      calls.push(`cacheLife(${profile})`);
    }),
    db: new Proxy({}, dbHandler),
  };
});

vi.mock("next/server", () => ({ connection: h.connection }));
vi.mock("next/cache", () => ({ cacheTag: h.cacheTag, cacheLife: h.cacheLife }));
vi.mock("@/lib/db", () => ({ db: h.db }));

import sitemap, { generateSitemaps } from "@/app/sitemap";
import { SITEMAP_SHARD_TAGS } from "@/lib/seo/sitemap-tags";

beforeEach(() => {
  h.calls.length = 0;
  vi.clearAllMocks();
});

describe("the sitemap route renders per request", () => {
  it("awaits a request-time API before touching the database", async () => {
    await sitemap({ id: Promise.resolve("1") });

    expect(h.connection).toHaveBeenCalledTimes(1);

    const firstDb = h.calls.findIndex((c) => c.startsWith("db."));
    const connectionAt = h.calls.indexOf("connection");
    expect(connectionAt).toBe(0);
    expect(firstDb).toBeGreaterThan(connectionAt);
  });

  it("opts out on every shard, not just the affairs one", async () => {
    for (const { id } of await generateSitemaps()) {
      h.calls.length = 0;
      h.connection.mockClear();
      await sitemap({ id: Promise.resolve(String(id)) });
      expect(h.connection, `shard ${id}`).toHaveBeenCalledTimes(1);
    }
  });

  it("keeps the data builders cached and tagged", async () => {
    for (const [shard, tags] of Object.entries(SITEMAP_SHARD_TAGS)) {
      h.calls.length = 0;
      await sitemap({ id: Promise.resolve(shard) });

      expect(h.cacheTag, `shard ${shard}`).toHaveBeenCalledWith(...tags);
      expect(h.cacheLife, `shard ${shard}`).toHaveBeenCalledWith("synced");
    }
  });

  it("declares the tags before reading, so the read is what gets cached", async () => {
    await sitemap({ id: Promise.resolve("1") });

    const tagAt = h.calls.findIndex((c) => c.startsWith("cacheTag("));
    const firstDb = h.calls.findIndex((c) => c.startsWith("db."));
    expect(tagAt).toBeGreaterThanOrEqual(0);
    expect(firstDb).toBeGreaterThan(tagAt);
  });

  it("still exposes exactly five shards", async () => {
    expect(await generateSitemaps()).toEqual([
      { id: 0 },
      { id: 1 },
      { id: 2 },
      { id: 3 },
      { id: 4 },
    ]);
  });

  it("returns nothing for an unknown shard rather than throwing", async () => {
    await expect(sitemap({ id: Promise.resolve("9") })).resolves.toEqual([]);
  });

  it("keeps every server-rendered statistics section discoverable", async () => {
    const urls = (await sitemap({ id: Promise.resolve("0") })).map((entry) => entry.url);
    expect(urls).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\/statistiques$/),
        expect.stringMatching(/\/statistiques\/factchecks$/),
        expect.stringMatching(/\/statistiques\/legislatif$/),
        expect.stringMatching(/\/statistiques\/participation$/),
      ])
    );
  });
});
