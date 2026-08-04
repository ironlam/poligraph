import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { MetadataRoute } from "next";
import { OG_IMAGE_DISALLOW_PATHS, SOCIAL_PREVIEW_USER_AGENTS } from "@/lib/seo/og-image-robots";
import { VOTES_LISTING_FILTER_KEYS } from "@/lib/seo/listing-filters";

const ORIGINAL_VERCEL_ENV = process.env.VERCEL_ENV;

/** Import fresh each time: robots.ts reads VERCEL_ENV at module scope. */
async function loadRobots(vercelEnv: string | undefined): Promise<MetadataRoute.Robots> {
  if (vercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = vercelEnv;
  vi.resetModules();
  const mod = await import("../robots");
  return mod.default();
}

const asArray = (v: string | string[] | undefined): string[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

/**
 * Google's robots.txt path matching: a rule is a prefix match, `*` stands for any run of
 * characters, and a trailing `$` anchors the end. Implemented rather than approximated
 * with startsWith/includes, because a rule like `/parlement/votes?*theme=` must NOT match
 * `/parlement/votes/themes/sante` — the exact boundary this file is here to protect.
 */
function matchesRobotsPattern(pattern: string, url: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source =
    "^" +
    body
      .split("*")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*") +
    (anchored ? "$" : "");
  return new RegExp(source).test(url);
}

const groupFor = (rules: MetadataRoute.Robots, agent: string) => {
  const list = Array.isArray(rules.rules) ? rules.rules : [rules.rules!];
  return list.find((r) => asArray(r.userAgent).includes(agent));
};

afterEach(() => {
  if (ORIGINAL_VERCEL_ENV === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = ORIGINAL_VERCEL_ENV;
  vi.resetModules();
});

describe("robots.txt — non-production", () => {
  it("blocks everything and announces no sitemap", async () => {
    const robots = await loadRobots("preview");
    const generic = groupFor(robots, "*")!;
    expect(asArray(generic.disallow)).toEqual(["/"]);
    expect(robots.sitemap).toBeUndefined();
  });
});

describe("robots.txt — production", () => {
  let robots: MetadataRoute.Robots;

  beforeEach(async () => {
    robots = await loadRobots("production");
  });

  it("announces every sitemap shard", () => {
    expect(asArray(robots.sitemap as string[])).toHaveLength(5);
  });

  describe("generic crawlers", () => {
    const disallow = () => asArray(groupFor(robots, "*")!.disallow);

    it("keeps the site allowed at the root", () => {
      expect(asArray(groupFor(robots, "*")!.allow)).toEqual(["/"]);
    });

    it.each(["/admin/", "/api/admin/"])("blocks the private surface %s", (path) => {
      expect(disallow()).toContain(path);
    });

    it.each(OG_IMAGE_DISALLOW_PATHS)("blocks the opengraph-image route %s", (path) => {
      expect(disallow()).toContain(path);
    });

    // Each filter key must have its own rule: robots.txt has no boolean logic, so a
    // single pattern cannot cover a facet space that combines keys in any order.
    it.each(VOTES_LISTING_FILTER_KEYS)("blocks the /parlement/votes ?%s facet", (key) => {
      expect(disallow()).toContain(`/parlement/votes?*${key}=`);
    });

    // The two indexable variants of the listing carry none of those keys, and the
    // detail/theme routes live under a `/` rather than a `?`, so no rule reaches them.
    it.each([
      "/parlement/votes",
      "/parlement/votes?filter=expliques",
      "/parlement/votes/themes/sante",
      "/parlement/votes/2026-07-02-l-amendement-n-76",
    ])("leaves %s crawlable", (url) => {
      const blocking = disallow().filter((pattern) => matchesRobotsPattern(pattern, url));
      expect(blocking).toEqual([]);
    });

    // Search Console attributes roughly 9K of the site's ~23K clicks to these facets.
    // They are the strongest organic surface Poligraph has: their duplicate handling is
    // canonical-only, never a crawl block.
    it.each(["mandat", "parti", "certainty", "view"])(
      "never blocks the /affaires/condamnations ?%s facet",
      (key) => {
        expect(disallow()).not.toContain(`/affaires/condamnations?*${key}=`);
        expect(disallow()).not.toContain(`/*?*${key}=`);
      }
    );
  });

  describe("social preview crawlers", () => {
    it("gives every social user agent its own group", () => {
      for (const agent of SOCIAL_PREVIEW_USER_AGENTS) {
        expect(groupFor(robots, agent)).toBeDefined();
      }
    });

    // The whole point of the group: these bots honour robots.txt, so blocking the OG
    // route for them would silently break link previews on every platform.
    it.each(OG_IMAGE_DISALLOW_PATHS)("does not block %s for social bots", (path) => {
      const social = groupFor(robots, SOCIAL_PREVIEW_USER_AGENTS[0])!;
      expect(asArray(social.disallow)).not.toContain(path);
    });

    // A crawler obeys only the most specific group naming it and ignores the `*` group,
    // so the shared rules have to be restated here or they stop applying.
    it.each(["/admin/", "/api/admin/", "/elections/municipales-2014/"])(
      "still blocks the shared path %s for social bots",
      (path) => {
        const social = groupFor(robots, SOCIAL_PREVIEW_USER_AGENTS[0])!;
        expect(asArray(social.disallow)).toContain(path);
      }
    );
  });
});
