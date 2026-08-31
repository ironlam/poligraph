import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { describe, it, expect, vi } from "vitest";
import {
  politicianRobotsMetadata,
  MAIRE_MIN_COMMUNE_POPULATION,
  type PoliticianIndexSignals,
} from "../politician-robots";
import { communeRobotsMetadata, COMMUNE_MIN_POPULATION } from "../commune-robots";
import { hasActiveListingFilter, listingRobotsMetadata } from "../listing-robots";
import { voteDateArchiveRobotsMetadata } from "../parliament-robots";
import { scrutinRobotsMetadata, type ScrutinIndexSignals } from "../scrutin-robots";
import { OG_IMAGE_ROBOTS_SOURCE } from "../og-image-robots";
import { API_NOINDEX_HEADERS, API_ROBOTS_SOURCE } from "../api-robots";
import {
  AFFAIRES_LISTING_FILTER_KEYS,
  POLITIQUES_LISTING_FILTER_KEYS,
  VOTES_LISTING_FILTER_KEYS,
  DOSSIERS_LISTING_FILTER_KEYS,
  PRESIDENTIAL_CANDIDATES_FILTER_KEYS,
} from "../listing-filters";

// votes/page.tsx renders <ScrutinsListing>, whose data-layer import chain
// (src/lib/data/scrutins.ts -> src/lib/db.ts) constructs a real Prisma
// client at module load. generateMetadata itself never touches the
// database, so stub db here to import the module safely with no DB
// available (e.g. in CI). Same pattern as explained-seo.test.ts.
vi.mock("@/lib/db", () => ({ db: {} }));

import { generateMetadata as votesGenerateMetadata } from "@/app/parlement/votes/page";
import { metadata as presidentialComparisonMetadata } from "@/app/elections/presidentielle-2027/comparer/page";
import { metadata as presidentialMeasuresMethodologyMetadata } from "@/app/methodologie/mesures-presidentielle-2027/page";

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

const BARE_AMENDMENT: ScrutinIndexSignals = {
  type: "AMENDEMENT",
  totalVotes: 212,
  citizenImpact: null,
  isKeyVote: false,
};
const BARE_VOTE_SOLENNEL: ScrutinIndexSignals = { ...BARE_AMENDMENT, type: "FINAL" };

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
  it("vote solennel, even with no prose attached", () => {
    expect(scrutinRobotsMetadata(BARE_VOTE_SOLENNEL)).toEqual(INDEXABLE);
  });
  it("amendment with a written citizen impact", () => {
    expect(scrutinRobotsMetadata({ ...BARE_AMENDMENT, citizenImpact: "Un impact." })).toEqual(
      INDEXABLE
    );
  });
  it("editorially promoted key vote", () => {
    expect(scrutinRobotsMetadata({ ...BARE_AMENDMENT, isKeyVote: true })).toEqual(INDEXABLE);
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
  it("sorted /parlement/votes (?sort=close)", () => {
    expect(listingRobots({ sort: "close" }, VOTES_LISTING_FILTER_KEYS)).toEqual(NOINDEX_FOLLOW);
  });
  it("filtered /parlement/dossiers (?status)", () => {
    expect(listingRobots({ status: "ADOPTED" }, DOSSIERS_LISTING_FILTER_KEYS)).toEqual(
      NOINDEX_FOLLOW
    );
  });
  it("filtered presidential candidates directory (?statut)", () => {
    expect(listingRobots({ statut: "annoncees" }, PRESIDENTIAL_CANDIDATES_FILTER_KEYS)).toEqual(
      NOINDEX_FOLLOW
    );
  });
  it("searched presidential candidates directory (?q)", () => {
    expect(listingRobots({ q: "dupont" }, PRESIDENTIAL_CANDIDATES_FILTER_KEYS)).toEqual(
      NOINDEX_FOLLOW
    );
  });
  it("presidential comparison combinations stay noindex,follow", () => {
    expect(presidentialComparisonMetadata.robots).toEqual({ index: false, follow: true });
    expect(presidentialComparisonMetadata.alternates?.canonical).toBe(
      "/elections/presidentielle-2027/comparer"
    );
  });
  it("paginated listing (page=2)", () => {
    expect(listingRobots({ page: "2" }, AFFAIRES_LISTING_FILTER_KEYS)).toEqual(NOINDEX_FOLLOW);
  });
  it("vote date archive (bare date)", () => {
    expect(voteDateArchiveRobotsMetadata("2026-03-04")).toEqual(NOINDEX_FOLLOW);
  });
  // Thousands of these ship per legislature and differ from each other by an amendment
  // number: a correct self-canonical does not stop Google reading them as duplicates.
  it("bare amendment scrutin (no key-vote flag, no citizen impact)", () => {
    expect(scrutinRobotsMetadata(BARE_AMENDMENT)).toEqual(NOINDEX_FOLLOW);
  });
  it("amendment whose citizen impact is blank", () => {
    expect(scrutinRobotsMetadata({ ...BARE_AMENDMENT, citizenImpact: "   " })).toEqual(
      NOINDEX_FOLLOW
    );
  });
  it("scrutin with no ballot recorded, whatever its type", () => {
    expect(scrutinRobotsMetadata({ ...BARE_VOTE_SOLENNEL, totalVotes: 0 })).toEqual(NOINDEX_FOLLOW);
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
      mandatory: ["chamber", "theme", "result", "sort"],
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

describe("doctrine — /parlement/votes sort stays out of the canonical", () => {
  it("?sort=close is noindex,follow and canonical drops sort", async () => {
    const m = await votesGenerateMetadata({
      searchParams: Promise.resolve({ sort: "close" }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((m.robots as any)?.index).toBe(false);
    expect(m.alternates?.canonical).toBe("/parlement/votes");
  });

  it("?sort=recent (default) is reachable and stays indexable, same canonical", async () => {
    const m = await votesGenerateMetadata({
      searchParams: Promise.resolve({ sort: "recent" }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((m.robots as any)?.index).not.toBe(false);
    expect(m.alternates?.canonical).toBe("/parlement/votes");
  });

  it("bare listing (no sort param) matches ?sort=recent exactly", async () => {
    const bare = await votesGenerateMetadata({
      searchParams: Promise.resolve({}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const recent = await votesGenerateMetadata({
      searchParams: Promise.resolve({ sort: "recent" }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(recent.robots).toEqual(bare.robots);
    expect(recent.alternates?.canonical).toBe(bare.alternates?.canonical);
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

  // The scrutin shard has no shared constant to import (the predicate is a query, not a
  // threshold), so the guard is that each isIndexableScrutin() signal appears in the
  // shard's own filter. A sitemap that announced noindex scrutins would spend crawl
  // budget to reach a noindex, the exact waste this shard avoids.
  //
  // Scoped to the query with its comments stripped, not the whole file: matching the file
  // let a signal named in the surrounding prose keep the guard green after the predicate
  // had dropped it. Removing the summary condition used to leave this test passing.
  const scrutinShardQuery = (() => {
    const start = src.indexOf("async function buildScrutinsSitemap");
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf("\n}", start);
    return src
      .slice(start, end)
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*|--)/.test(line))
      .join("\n");
  })();

  it.each(["AMENDEMENT", "isKeyVote", "citizenImpact", "votesFor"])(
    "scrutin shard filters on the %s signal",
    (signal) => {
      expect(scrutinShardQuery).toContain(signal);
    }
  );

  it("keeps the SQL/JS parity that isIndexableScrutin() needs on the text signal", () => {
    // hasText() trims before testing, so a value made of whitespace must not count here
    // either. Mirrors the btrim already used for the biography threshold above.
    expect(scrutinShardQuery).toContain('btrim(COALESCE(s."citizenImpact"');
  });

  // The shard must not reintroduce the saturated signals the predicate dropped: keying on
  // them withheld zero pages when measured against production.
  it.each(["summary", "APPROVED"])("scrutin shard does not filter on %s", (signal) => {
    expect(scrutinShardQuery).not.toContain(signal);
  });

  it("keeps an unknown scrutin type fail-open", () => {
    expect(scrutinShardQuery).toContain("IS DISTINCT FROM");
  });
});

describe("doctrine — presidential measure methodology stays indexable and discoverable", () => {
  const sitemapSource = readFileSync(join(process.cwd(), "src/app/sitemap.ts"), "utf8");

  it("keeps a self-canonical indexable page", () => {
    expect(presidentialMeasuresMethodologyMetadata.alternates?.canonical).toBe(
      "/methodologie/mesures-presidentielle-2027"
    );
    expect(presidentialMeasuresMethodologyMetadata.robots).not.toMatchObject({ index: false });
  });

  it("keeps the page in the static sitemap", () => {
    expect(sitemapSource).toContain("url: `${SITE_URL}/methodologie/mesures-presidentielle-2027`");
  });
});

describe("doctrine — presidentielle-2027 hub stays out of the sitemap while unpublishable", () => {
  const src = readFileSync(join(process.cwd(), "src/app/sitemap.ts"), "utf8");

  it("imports isHubPublishable rather than a hardcoded threshold", () => {
    expect(src).toContain('from "@/config/publication-gates"');
    expect(src).toContain("isHubPublishable");
  });

  // Scoped to the shard, comments stripped, the same guard as the scrutin shard above: the
  // election shard must actually gate the URL on isHubPublishable, not merely import it.
  const electionShard = (() => {
    const start = src.indexOf("async function buildAffairsPartiesElectionsDepartmentsSitemap");
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf("\nasync function", start + 1);
    return src
      .slice(start, end)
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join("\n");
  })();

  it("filters the election shard on isHubPublishable before mapping to URLs", () => {
    expect(electionShard).toContain("PRESIDENTIELLE_2027_SLUG");
    expect(electionShard).toContain("isHubPublishable(");
    // Scoped past `const electionPages`: parties and partiesWithAffairs above it also
    // filter-then-map, so an unscoped search would pass on the wrong pair.
    const electionPagesAt = electionShard.indexOf("const electionPages");
    expect(electionPagesAt).toBeGreaterThan(-1);
    const filterAt = electionShard.indexOf(".filter(", electionPagesAt);
    const mapAt = electionShard.indexOf(".map(", electionPagesAt);
    expect(filterAt).toBeGreaterThan(electionPagesAt);
    expect(mapAt).toBeGreaterThan(filterAt);
  });

  it("ajoute l'annuaire présidentiel au même seuil que le hub", () => {
    expect(electionShard).toContain("const presidentialDirectoryPages");
    expect(electionShard).toContain(
      "`${SITE_URL}/elections/${PRESIDENTIELLE_2027_SLUG}/candidats`"
    );
    expect(electionShard).toMatch(
      /const presidentialDirectoryPages:[\s\S]*=\s*presidentielleHubPublishable[\s\S]*\?/
    );
    expect(electionShard).toContain("...presidentialDirectoryPages");
  });

  it("annonce la couverture et les thèmes uniquement sous la porte du hub", () => {
    expect(electionShard).toContain("const presidentialSubjectPages");
    expect(electionShard).toContain("${SITE_URL}/elections/${PRESIDENTIELLE_2027_SLUG}/themes");
    expect(electionShard).toContain("theme.publishable");
    expect(electionShard).toContain("...presidentialSubjectPages");
  });

  it("réutilise l'autorité publique des mesures pour leurs URLs canoniques", () => {
    expect(electionShard).toContain("PUBLIC_PRESIDENTIAL_MEASURE_WHERE");
    expect(electionShard).toContain("const presidentialMeasurePages");
    expect(electionShard).toContain(
      "${SITE_URL}/elections/${PRESIDENTIELLE_2027_SLUG}/mesures/${measure.slug}"
    );
    expect(electionShard).toContain("...presidentialMeasurePages");
  });

  it("annonce uniquement les repères substantiels reliés au corpus public", () => {
    expect(electionShard).toContain("loadPresidentialReaderGuideIndex");
    expect(electionShard).toContain("guide.indexable");
    expect(electionShard).toContain("const presidentialReaderGuidePages");
    expect(electionShard).toContain("presidentialReaderGuidesPath()");
    expect(electionShard).toContain("presidentialReaderGuidePath(guide.slug)");
    expect(electionShard).toContain("...presidentialReaderGuidePages");
    expect(electionShard).toMatch(
      /const presidentialReaderGuidePages:[\s\S]*=\s*indexablePresidentialReaderGuides\.length > 0/
    );
  });
});

describe("doctrine — la recherche présidentielle reste une surface utilitaire", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/elections/presidentielle-2027/recherche/page.tsx"),
    "utf8"
  );

  it("est noindex,follow avec un canonical sans requête", () => {
    expect(src).toContain("robots: { index: false, follow: true }");
    expect(src).toContain("alternates: { canonical: PAGE_PATH }");
  });
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
