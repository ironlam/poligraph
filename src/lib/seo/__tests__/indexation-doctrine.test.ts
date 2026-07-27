import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { describe, it, expect } from "vitest";
import {
  politicianRobotsMetadata,
  MAIRE_MIN_COMMUNE_POPULATION,
  type PoliticianIndexSignals,
} from "../politician-robots";
import { communeRobotsMetadata, COMMUNE_MIN_POPULATION } from "../commune-robots";
import { hasActiveListingFilter, listingRobotsMetadata } from "../listing-robots";
import { voteDateArchiveRobotsMetadata } from "../parliament-robots";
import { OG_IMAGE_ROBOTS_SOURCE } from "../og-image-robots";
import { API_NOINDEX_HEADERS, API_ROBOTS_SOURCE } from "../api-robots";
import {
  AFFAIRES_LISTING_FILTER_KEYS,
  POLITIQUES_LISTING_FILTER_KEYS,
  VOTES_LISTING_FILTER_KEYS,
  DOSSIERS_LISTING_FILTER_KEYS,
} from "../listing-filters";

// Living map of the index-bloat doctrine. If any representative surface flips, this
// file fails: a strong page must never become noindex, a thin one must never become
// indexable, and a filtered listing variant must never slip back into the index.
const INDEXABLE = {};
const NOINDEX_FOLLOW = { robots: { index: false, follow: true } };

const NO_OTHER_SIGNAL = {
  publishedAffairsCount: 0,
  factCheckMentionsCount: 0,
  declarationsCount: 0,
  biography: null,
} as const;

const RICH_DEPUTE: PoliticianIndexSignals = { mandates: [{ type: "DEPUTE" }], ...NO_OTHER_SIGNAL };
const BIG_MAYOR: PoliticianIndexSignals = {
  mandates: [{ type: "MAIRE", communePopulation: MAIRE_MIN_COMMUNE_POPULATION }],
  ...NO_OTHER_SIGNAL,
};
const BARE_SMALL_MAYOR: PoliticianIndexSignals = {
  mandates: [{ type: "MAIRE", communePopulation: 200 }],
  ...NO_OTHER_SIGNAL,
};
const THIN_LOCAL: PoliticianIndexSignals = {
  mandates: [{ type: "CONSEILLER_MUNICIPAL" }],
  ...NO_OTHER_SIGNAL,
};

const listingRobots = (params: Record<string, string>, keys: readonly string[]) =>
  listingRobotsMetadata(hasActiveListingFilter(params, keys));

describe("doctrine — strong surfaces stay indexable", () => {
  it("rich politician (député)", () => {
    expect(politicianRobotsMetadata(RICH_DEPUTE)).toEqual(INDEXABLE);
  });
  it("mayor of a significant commune", () => {
    expect(politicianRobotsMetadata(BIG_MAYOR)).toEqual(INDEXABLE);
  });
  it("significant commune page (>= threshold)", () => {
    expect(communeRobotsMetadata(COMMUNE_MIN_POPULATION)).toEqual(INDEXABLE);
  });
  it("commune with unknown population (fail-open)", () => {
    expect(communeRobotsMetadata(null)).toEqual(INDEXABLE);
  });
  it("bare /affaires listing", () => {
    expect(listingRobots({}, AFFAIRES_LISTING_FILTER_KEYS)).toEqual(INDEXABLE);
  });
  it("bare /politiques listing", () => {
    expect(listingRobots({}, POLITIQUES_LISTING_FILTER_KEYS)).toEqual(INDEXABLE);
  });
  it("bare /parlement/votes listing", () => {
    expect(listingRobots({}, VOTES_LISTING_FILTER_KEYS)).toEqual(INDEXABLE);
  });
  it("bare /parlement/dossiers listing", () => {
    expect(listingRobots({}, DOSSIERS_LISTING_FILTER_KEYS)).toEqual(INDEXABLE);
  });
  it("vote detail page (dated slug with title)", () => {
    expect(voteDateArchiveRobotsMetadata("2026-03-04-loi-de-finances")).toEqual(INDEXABLE);
  });
});

describe("doctrine — thin/duplicate surfaces stay out of the index", () => {
  it("bare RNE-imported mayor (small commune, no signal)", () => {
    expect(politicianRobotsMetadata(BARE_SMALL_MAYOR)).toEqual(NOINDEX_FOLLOW);
  });
  it("thin local profile (councillor, no signal)", () => {
    expect(politicianRobotsMetadata(THIN_LOCAL)).toEqual(NOINDEX_FOLLOW);
  });
  it("small commune page (< threshold)", () => {
    expect(communeRobotsMetadata(COMMUNE_MIN_POPULATION - 1)).toEqual(NOINDEX_FOLLOW);
  });
  it("filtered /affaires (?parti)", () => {
    expect(listingRobots({ parti: "rn" }, AFFAIRES_LISTING_FILTER_KEYS)).toEqual(NOINDEX_FOLLOW);
  });
  it("filtered /politiques (?party)", () => {
    expect(listingRobots({ party: "lfi" }, POLITIQUES_LISTING_FILTER_KEYS)).toEqual(NOINDEX_FOLLOW);
  });
  it("filtered /parlement/votes (?chamber)", () => {
    expect(listingRobots({ chamber: "AN" }, VOTES_LISTING_FILTER_KEYS)).toEqual(NOINDEX_FOLLOW);
  });
  it("filtered /parlement/dossiers (?status)", () => {
    expect(listingRobots({ status: "ADOPTED" }, DOSSIERS_LISTING_FILTER_KEYS)).toEqual(
      NOINDEX_FOLLOW
    );
  });
  it("paginated listing (page=2)", () => {
    expect(listingRobots({ page: "2" }, AFFAIRES_LISTING_FILTER_KEYS)).toEqual(NOINDEX_FOLLOW);
  });
  it("vote date archive (bare date)", () => {
    expect(voteDateArchiveRobotsMetadata("2026-03-04")).toEqual(NOINDEX_FOLLOW);
  });
});

describe("doctrine — listing noindex perimeters can't silently shrink", () => {
  const LISTINGS = [
    {
      route: "/affaires",
      keys: AFFAIRES_LISTING_FILTER_KEYS,
      mandatory: ["parti", "certainty", "status"],
    },
    { route: "/politiques", keys: POLITIQUES_LISTING_FILTER_KEYS, mandatory: ["party", "mandate"] },
    {
      route: "/parlement/votes",
      keys: VOTES_LISTING_FILTER_KEYS,
      mandatory: ["chamber", "theme", "result"],
    },
    {
      route: "/parlement/dossiers",
      keys: DOSSIERS_LISTING_FILTER_KEYS,
      mandatory: ["status", "theme"],
    },
  ];

  it.each(LISTINGS)("$route keeps its mandatory filter keys", ({ keys, mandatory }) => {
    for (const key of mandatory) expect(keys).toContain(key);
  });

  it.each(LISTINGS)("$route: every configured key flips the listing to noindex", ({ keys }) => {
    for (const key of keys) {
      expect(hasActiveListingFilter({ [key]: "x" }, keys)).toBe(true);
    }
  });
});

describe("doctrine — sitemap shares the indexability thresholds (no drift)", () => {
  const src = readFileSync(join(process.cwd(), "src/app/sitemap.ts"), "utf8");

  it("imports the predicate constants from the shared helper", () => {
    expect(src).toContain('from "@/lib/seo/politician-robots"');
  });

  it.each(["SIGNIFICANT_MANDATE_TYPES", "MAIRE_MIN_COMMUNE_POPULATION", "MIN_BIOGRAPHY_LENGTH"])(
    "uses %s rather than a hardcoded value",
    (name) => {
      expect(src).toContain(name);
    }
  );
});

describe("doctrine — opengraph-image assets stay noindexed", () => {
  const require = createRequire(import.meta.url);
  const { pathToRegexp } = require("next/dist/compiled/path-to-regexp") as {
    pathToRegexp: (path: string, keys?: unknown[], opts?: Record<string, unknown>) => RegExp;
  };
  const re = pathToRegexp(OG_IMAGE_ROBOTS_SOURCE, [], {
    delimiter: "/",
    sensitive: false,
    strict: false,
  });

  it("matches OG image asset paths", () => {
    expect(re.test("/parlement/votes/loi/opengraph-image")).toBe(true);
    expect(re.test("/opengraph-image")).toBe(true);
  });
  it("leaves the parent page indexable", () => {
    expect(re.test("/parlement/votes/loi")).toBe(false);
  });
});

describe("doctrine — /api endpoints stay noindexed", () => {
  const require = createRequire(import.meta.url);
  const { pathToRegexp } = require("next/dist/compiled/path-to-regexp") as {
    pathToRegexp: (path: string, keys?: unknown[], opts?: Record<string, unknown>) => RegExp;
  };
  const re = pathToRegexp(API_ROBOTS_SOURCE, [], {
    delimiter: "/",
    sensitive: false,
    strict: false,
  });

  it("tags every rule with X-Robots-Tag: noindex", () => {
    expect(API_NOINDEX_HEADERS.length).toBeGreaterThan(0);
    for (const rule of API_NOINDEX_HEADERS) {
      expect(rule.headers).toContainEqual({ key: "X-Robots-Tag", value: "noindex" });
    }
  });

  it.each(["/api/export/politiques", "/api/export/factchecks", "/api/docs", "/api/chat"])(
    "noindexes API endpoint %s",
    (path) => {
      expect(re.test(path)).toBe(true);
    }
  );

  // The human-readable API documentation is a real page and must stay indexable.
  it.each(["/docs/api", "/statistiques"])("leaves real page %s indexable", (path) => {
    expect(re.test(path)).toBe(false);
  });
});

// The profile sub-tabs reuse the profile's own richness predicate, so a bare
// RNE-imported mayor cannot leave two extra crawlable URLs behind. Guarded at
// the source level: the pages must call politicianRobotsMetadata, not hardcode
// their own rule.
describe("doctrine — politician sub-tabs inherit the profile's indexability", () => {
  it.each([
    "src/app/politiques/[slug]/votes/page.tsx",
    "src/app/politiques/[slug]/relations/page.tsx",
  ])("%s applies politicianRobotsMetadata", (file) => {
    const src = readFileSync(join(process.cwd(), file), "utf8");
    expect(src).toContain("politicianRobotsMetadata");
    expect(src).toContain("getPoliticianIndexSignals");
  });

  it("noindexes the sub-tabs of a bare mayor and leaves a député's indexable", () => {
    expect(politicianRobotsMetadata(BARE_SMALL_MAYOR)).toEqual(NOINDEX_FOLLOW);
    expect(politicianRobotsMetadata(RICH_DEPUTE)).toEqual(INDEXABLE);
  });
});
