import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { describe, it, expect, vi } from "vitest";
import {
  politicianRobotsMetadata,
  MAIRE_MIN_COMMUNE_POPULATION,
  type PoliticianIndexSignals,
} from "../politician-robots";
import {
  PARRAINAGES_CANDIDAT_MIN_PRESENTATIONS,
  isIndexableParrainagesCandidat,
  parrainagesCandidatRobotsMetadata,
  parrainagesSitemapEntries,
} from "../parrainages-robots";
import { communeRobotsMetadata, COMMUNE_MIN_POPULATION } from "../commune-robots";
import {
  territoireBudgetRobotsMetadata,
  territoireCommuneRobotsMetadata,
  TERRITOIRE_COMMUNE_MIN_POPULATION,
} from "../territoire-robots";
import { hasActiveListingFilter, listingRobotsMetadata } from "../listing-robots";
import { voteDateArchiveRobotsMetadata } from "../parliament-robots";
import { scrutinRobotsMetadata, type ScrutinIndexSignals } from "../scrutin-robots";
import {
  factCheckRobotsMetadata,
  isIndexableFactCheck,
  type FactCheckIndexSignals,
} from "../factcheck-robots";
import { OG_IMAGE_ROBOTS_SOURCE } from "../og-image-robots";
import { API_NOINDEX_HEADERS, API_ROBOTS_SOURCE } from "../api-robots";
import { NEXT_STATIC_NOINDEX_HEADERS, NEXT_STATIC_ROBOTS_SOURCE } from "../next-static-robots";
import {
  AFFAIRES_LISTING_FILTER_KEYS,
  POLITIQUES_LISTING_FILTER_KEYS,
  VOTES_LISTING_FILTER_KEYS,
  DOSSIERS_LISTING_FILTER_KEYS,
  PRESIDENTIAL_CANDIDATES_FILTER_KEYS,
  PRESIDENTIAL_AFFAIRS_FILTER_KEYS,
} from "../listing-filters";

// votes/page.tsx renders <ScrutinsListing>, whose data-layer import chain
// (src/lib/data/scrutins.ts -> src/lib/db.ts) constructs a real Prisma
// client at module load. generateMetadata itself never touches the
// database, so stub db here to import the module safely with no DB
// available (e.g. in CI). Same pattern as explained-seo.test.ts.
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/data/presidentielle-affaires", () => ({
  getPresidentialAffairs: vi.fn(),
}));
vi.mock("@/lib/data/politician-candidacy", () => ({
  getPoliticianPresidentialCandidacy: vi.fn(),
  getCandidateFicheDetail: vi.fn(),
}));
vi.mock("@/lib/data/politician-profile", () => ({
  getPoliticianProfile: vi.fn(),
}));
vi.mock("@/lib/data/hub", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/hub")>()),
  getHubCandidacyField: vi.fn(),
}));

import { generateMetadata as votesGenerateMetadata } from "@/app/parlement/votes/page";
import { generateMetadata as presidentialAffairsGenerateMetadata } from "@/app/elections/presidentielle-2027/affaires-judiciaires/page";
import { getPresidentialAffairs } from "@/lib/data/presidentielle-affaires";
import { metadata as presidentialComparisonMetadata } from "@/app/elections/presidentielle-2027/comparer/page";
import { metadata as presidentialMeasuresMethodologyMetadata } from "@/app/methodologie/mesures-presidentielle-2027/page";
import { generateMetadata as candidateFicheGenerateMetadata } from "@/app/elections/presidentielle-2027/candidats/[slug]/page";
import { getPoliticianPresidentialCandidacy } from "@/lib/data/politician-candidacy";
import { getPoliticianProfile } from "@/lib/data/politician-profile";
import { generateMetadata as candidatesDirectoryGenerateMetadata } from "@/app/elections/presidentielle-2027/candidats/page";
import { getHubCandidacyField } from "@/lib/data/hub";

// Living map of the index-bloat doctrine. If any representative surface flips, this
// file fails: a strong page must never become noindex, a thin one must never become
// indexable, and a filtered listing variant must never slip back into the index.
const INDEXABLE = {};
const NOINDEX_FOLLOW = { robots: { index: false, follow: true } };

it("désindexe la désambiguïsation des noms de lois, sans ajouter les alias au sitemap", async () => {
  const { metadata } = await import("@/app/parlement/lois/[slug]/dossiers/page");
  expect(metadata.robots).toEqual(NOINDEX_FOLLOW.robots);
  const sitemap = readFileSync(join(process.cwd(), "src/app/sitemap.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  expect(sitemap).not.toContain("/parlement/lois/");
  expect(sitemap).toContain("/parlement/dossiers/${d.slug}");
});

const NO_OTHER_SIGNAL = {
  publishedAffairsCount: 0,
  factCheckMentionsCount: 0,
  declarationsCount: 0,
  biography: null,
} as const;

const RICH_DEPUTE: PoliticianIndexSignals = {
  mandates: [{ type: "DEPUTE" }],
  ...NO_OTHER_SIGNAL,
  biography: "Biographie validée d'un député, assez longue pour compter comme contenu éditorial.",
};
// A deputy mandate alone is not a content signal: fiches of former deputies created from the
// official archive carry votes but no biography (#1131).
const BARE_DEPUTE: PoliticianIndexSignals = { mandates: [{ type: "DEPUTE" }], ...NO_OTHER_SIGNAL };
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

const factCheckRobots = (signals: FactCheckIndexSignals) =>
  factCheckRobotsMetadata(isIndexableFactCheck(signals));
const FACTCHECK_NO_AUTHOR: FactCheckIndexSignals = {
  hasPublishedAuthor: false,
  authorFactCheckCount: 0,
  hasCandidacy: false,
  hasClaimDayVotes: false,
  hasThemeVotes: false,
  hasThemeProgramme: false,
};
const FACTCHECK_AUTHOR_WITH_RECORD: FactCheckIndexSignals = {
  hasPublishedAuthor: true,
  authorFactCheckCount: 6,
  hasCandidacy: false,
  hasClaimDayVotes: false,
  hasThemeVotes: false,
  hasThemeProgramme: false,
};

describe("doctrine — strong surfaces stay indexable", () => {
  it("presidential affairs hub with published content stays indexable", async () => {
    vi.mocked(getPresidentialAffairs).mockResolvedValue({
      affairs: [],
      total: 1,
      candidates: [],
      candidat: null,
      tri: "recentes",
    });
    const metadata = await presidentialAffairsGenerateMetadata({});
    expect(metadata.robots).toBeUndefined();
    expect(metadata.alternates?.canonical).toBe(
      "/elections/presidentielle-2027/affaires-judiciaires"
    );
  });

  // Arbitrated 2026-10-01, and a deliberate reversal: a sourced candidacy used to be held out of
  // the index until one primary-sourced measure existed. The missing programme is OUR gap, the page
  // names it in those words, and withholding the page read as a verdict on the candidate. The
  // measure count is left at zero here on purpose, because that is the case that used to fail.
  it("sourced presidential candidacy with no published measure stays indexable", async () => {
    vi.mocked(getPoliticianProfile).mockResolvedValue({
      identity: { id: "p1", fullName: "Camille Rivière" },
    } as unknown as Awaited<ReturnType<typeof getPoliticianProfile>>);
    vi.mocked(getPoliticianPresidentialCandidacy).mockResolvedValue({
      primarySourceMeasureCount: 0,
    } as unknown as Awaited<ReturnType<typeof getPoliticianPresidentialCandidacy>>);
    const metadata = await candidateFicheGenerateMetadata({
      params: Promise.resolve({ slug: "camille-riviere" }),
    });
    expect(metadata.robots).toBeUndefined();
    expect(metadata.alternates?.canonical).toBe(
      "/elections/presidentielle-2027/candidats/camille-riviere"
    );
  });

  // The directory title and description are computed from the tracked field (count, date). That
  // must not move its verdict: the bare directory stays indexable with its canonical, whatever
  // the field holds, and its filtered variants stay out (next describe).
  it("bare presidential candidates directory with a data-driven title stays indexable", async () => {
    vi.mocked(getHubCandidacyField).mockResolvedValue([
      {
        id: "c1",
        candidateName: "Camille Rivière",
        politicianSlug: "camille-riviere",
        photoUrl: null,
        blobPhotoUrl: null,
        status: "DECLARE",
        sourceUrl: "https://example.org/source",
        sourceLabel: "Source",
        partyLabel: null,
        partyColor: null,
        partyShortName: null,
        partyLogoUrl: null,
        measureCount: 0,
        themesCoveredCount: 0,
        programmeAbsence: "non_depouille",
        recordedAt: new Date("2026-11-20T10:00:00Z"),
      },
    ]);
    const metadata = await candidatesDirectoryGenerateMetadata({
      searchParams: Promise.resolve({}),
    });
    expect(metadata.robots).toBeUndefined();
    expect(metadata.alternates?.canonical).toBe("/elections/presidentielle-2027/candidats");
    expect(metadata.title).toEqual({
      absolute: "Candidats présidentielle 2027 : 1 déclaré (liste à jour)",
    });
    expect(String(metadata.description)).toContain("20 novembre 2026");

    const filtered = await candidatesDirectoryGenerateMetadata({
      searchParams: Promise.resolve({ [PRESIDENTIAL_CANDIDATES_FILTER_KEYS[0]!]: "x" }),
    });
    expect(filtered.robots).toEqual(NOINDEX_FOLLOW.robots);
    expect(filtered.alternates?.canonical).toBe("/elections/presidentielle-2027/candidats");
  });

  it("rich politician (député)", () => {
    expect(politicianRobotsMetadata(RICH_DEPUTE)).toEqual(INDEXABLE);
  });
  it("mayor of a significant commune", () => {
    expect(politicianRobotsMetadata(BIG_MAYOR)).toEqual(INDEXABLE);
  });
  it("council president created from the RNE, with no other signal (D22)", () => {
    for (const type of ["PRESIDENT_DEPARTEMENT", "PRESIDENT_REGION"]) {
      expect(politicianRobotsMetadata({ mandates: [{ type }], ...NO_OTHER_SIGNAL })).toEqual(
        INDEXABLE
      );
    }
  });
  it("significant commune page (>= threshold)", () => {
    expect(communeRobotsMetadata(COMMUNE_MIN_POPULATION)).toEqual(INDEXABLE);
  });
  it("commune with unknown population (fail-open)", () => {
    expect(communeRobotsMetadata(null)).toEqual(INDEXABLE);
  });
  it("Territoires commune page: known population >= threshold and public mayor established", () => {
    expect(
      territoireCommuneRobotsMetadata({
        population: TERRITOIRE_COMMUNE_MIN_POPULATION,
        maireEtabli: true,
      })
    ).toEqual(INDEXABLE);
  });
  it("Territoires /budget of a department or region with accounts of its own", () => {
    expect(territoireBudgetRobotsMetadata("DEP", "29")).toEqual({});
    expect(territoireBudgetRobotsMetadata("REG", "53")).toEqual({});
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
  it("fact-check with a vote of its author on the day of the claim, and a record", () => {
    expect(factCheckRobots({ ...FACTCHECK_AUTHOR_WITH_RECORD, hasClaimDayVotes: true })).toEqual(
      INDEXABLE
    );
  });
  it("fact-check with votes of its author on the validated theme, and a record", () => {
    expect(factCheckRobots({ ...FACTCHECK_AUTHOR_WITH_RECORD, hasThemeVotes: true })).toEqual(
      INDEXABLE
    );
  });
});

describe("doctrine — thin/duplicate surfaces stay out of the index", () => {
  it("bare RNE-imported mayor (small commune, no signal)", () => {
    expect(politicianRobotsMetadata(BARE_SMALL_MAYOR)).toEqual(NOINDEX_FOLLOW);
  });
  it("thin local profile (councillor, no signal)", () => {
    expect(politicianRobotsMetadata(THIN_LOCAL)).toEqual(NOINDEX_FOLLOW);
  });
  it("député without biography or any other signal", () => {
    expect(politicianRobotsMetadata(BARE_DEPUTE)).toEqual(NOINDEX_FOLLOW);
  });
  it("small commune page (< threshold)", () => {
    expect(communeRobotsMetadata(COMMUNE_MIN_POPULATION - 1)).toEqual(NOINDEX_FOLLOW);
  });
  it("Territoires commune page with unknown population (not presumed rich)", () => {
    expect(territoireCommuneRobotsMetadata({ population: null, maireEtabli: true })).toEqual(
      NOINDEX_FOLLOW
    );
  });
  it("Territoires commune page whose mayor is not established", () => {
    expect(territoireCommuneRobotsMetadata({ population: 500_000, maireEtabli: false })).toEqual(
      NOINDEX_FOLLOW
    );
  });
  it("Territoires /budget of a commune: one series template on 10 000 pages", () => {
    expect(territoireBudgetRobotsMetadata("COM", "29019")).toEqual(NOINDEX_FOLLOW);
  });
  it("Territoires /budget whose page only explains why it has no accounts of its own", () => {
    expect(territoireBudgetRobotsMetadata("DEP", "2A")).toEqual(NOINDEX_FOLLOW);
    expect(territoireBudgetRobotsMetadata("REG", "06")).toEqual(NOINDEX_FOLLOW);
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
  it("presidential affairs filtered by candidate (?candidat)", async () => {
    vi.mocked(getPresidentialAffairs).mockResolvedValue({
      affairs: [],
      total: 3,
      candidates: [],
      candidat: null,
      tri: "recentes",
    });
    const metadata = await presidentialAffairsGenerateMetadata({
      searchParams: Promise.resolve({ candidat: "jean-dupont" }),
    });
    expect(metadata.robots).toEqual(NOINDEX_FOLLOW.robots);
    expect(metadata.alternates?.canonical).toBe(
      "/elections/presidentielle-2027/affaires-judiciaires"
    );
  });
  it("sorted presidential affairs (?tri)", () => {
    expect(listingRobots({ tri: "anciennes" }, PRESIDENTIAL_AFFAIRS_FILTER_KEYS)).toEqual(
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
  it("fact-check with no single published author (duplicate of the source)", () => {
    expect(factCheckRobots(FACTCHECK_NO_AUTHOR)).toEqual(NOINDEX_FOLLOW);
  });
  it("fact-check whose author is well known but nothing is specific to the claim", () => {
    // Record, party and candidacy repeat on every page of the author (review of 2026-11-22).
    expect(factCheckRobots({ ...FACTCHECK_AUTHOR_WITH_RECORD, hasCandidacy: true })).toEqual(
      NOINDEX_FOLLOW
    );
  });
  it("fact-check with a claim-day vote but nothing on its author", () => {
    expect(
      factCheckRobots({
        ...FACTCHECK_AUTHOR_WITH_RECORD,
        authorFactCheckCount: 1,
        hasClaimDayVotes: true,
      })
    ).toEqual(NOINDEX_FOLLOW);
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
      route: "/elections/presidentielle-2027/affaires-judiciaires",
      keys: PRESIDENTIAL_AFFAIRS_FILTER_KEYS,
      mandatory: ["candidat", "tri"],
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
  it("Territoires /budget: the sitemap and the three pages read the same predicate", () => {
    const strip = (f: string) =>
      readFileSync(join(process.cwd(), f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    const sitemap = strip("src/app/sitemap.ts");
    expect(sitemap).toContain('isIndexableTerritoireBudget("REG"');
    expect(sitemap).toContain('isIndexableTerritoireBudget("DEP"');
    expect(sitemap).not.toMatch(/territoireCommuneBudgetPath/);
    for (const [route, scale] of [
      ["communes/[code]", "COM"],
      ["departements/[slug]", "DEP"],
      ["regions/[slug]", "REG"],
    ] as const) {
      expect(strip(`src/app/territoires/${route}/budget/page.tsx`), route).toContain(
        `...territoireBudgetRobotsMetadata("${scale}"`
      );
    }
  });

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

describe("doctrine: the fact-check shard mirrors isIndexableFactCheck()", () => {
  const src = readFileSync(join(process.cwd(), "src/app/sitemap.ts"), "utf8");

  it("imports the thresholds from the shared helper", () => {
    expect(src).toContain('from "@/lib/seo/factcheck-robots"');
  });

  // Scoped to the shard, comments stripped, like the scrutin guard above.
  const factChecksShard = (() => {
    const start = src.indexOf("async function buildFactChecksSitemap");
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf("\n}", start);
    return src
      .slice(start, end)
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*|--)/.test(line))
      .join("\n");
  })();

  it.each([
    "FACTCHECK_RECORD_MIN_TOTAL",
    "SCRUTIN_THEMES",
    "PUBLIC_POLITICIAN_PUBLICATION_STATUS",
    'getPublicFactCheckSqlWhere("fc")',
  ])("uses %s rather than a hardcoded value", (name) => {
    expect(factChecksShard).toContain(name);
  });

  it("lists the politician landing pages from the shared threshold", () => {
    expect(factChecksShard).toContain("/factchecks/politique/");
    expect(factChecksShard).toContain("FACTCHECK_POLITICIAN_MIN_CLAIMS");
    expect(factChecksShard).toContain('m."isClaimant"');
  });

  // The party sat on 95 % of the pages with a single author: it discriminated nothing.
  it("does not count the current party any more", () => {
    expect(factChecksShard).not.toContain("currentPartyId");
  });

  it("keeps a single claimant as the precondition", () => {
    expect(factChecksShard).toContain("HAVING count(*) = 1");
  });

  it("joint le programme au même auteur, à la même élection et au même thème", () => {
    const helper = readFileSync(join(process.cwd(), "src/lib/seo/factcheck-robots.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    const predicate = helper.match(/function hasClaimSpecificBlock[\s\S]*?\n\}/)?.[0];
    expect(predicate).toContain("signals.hasThemeProgramme");
    const start = factChecksShard.indexOf('SELECT 1 FROM "Measure" me');
    const programme = factChecksShard.slice(start, factChecksShard.indexOf("))", start));
    expect(programme).toContain('ca."id" = me."candidacyId"');
    expect(programme).toContain('ce."id" = ca."electionId"');
    expect(programme).toContain('e."id" = me."electionId"');
    expect(programme).toContain('ca."politicianId" = c."politicianId"');
    expect(programme).toContain('ce."slug" = ${PRESIDENTIELLE_2027_SLUG}');
    expect(programme).toContain('e."slug" = ${PRESIDENTIELLE_2027_SLUG}');
    expect(programme).toContain("me.\"publicationStatus\" = 'PUBLISHED'");
    expect(programme).toContain('me."theme" = fc."theme"');
    expect(programme).toContain('me."withdrawnAt" IS NULL');
    expect(programme).toContain('mr."id" = me."publishedRevisionId"');
    for (const alias of ["mr", "pr"]) {
      expect(programme).toContain(`${alias}."reviewedAt" IS NOT NULL`);
      expect(programme).toContain(`${alias}."publishedAt" IS NOT NULL`);
      for (const field of ["supersededAt", "discardedAt", "rejectedAt"]) {
        expect(programme).toContain(`${alias}."${field}" IS NULL`);
      }
    }
    expect(programme).toContain('ms."measureRevisionId" = mr."id"');
    expect(programme).toContain('cp."candidacyId" = ca."id"');
    expect(programme).toContain("cp.\"publicationStatus\" = 'PUBLISHED'");
    for (const field of ["status", "sourceUrl", "sourceLabel"]) {
      expect(programme).toContain(`ca."${field}" IS NOT NULL`);
    }
    expect(programme).toContain('pm."candidacyId" = ca."id"');
    expect(programme).toContain("pm.\"publicationStatus\" = 'PUBLISHED'");
    expect(programme).toContain('pm."withdrawnAt" IS NULL');
    expect(programme).toContain('pr."id" = pm."publishedRevisionId"');
    expect(programme).toContain('ps."measureRevisionId" = pr."id"');
    expect(programme).toContain("ps.\"tier\" = 'PRIMARY'");
    expect(factChecksShard).toContain("cacheTag(`election-candidacies:${election.id}`)");
    const page = readFileSync(join(process.cwd(), "src/app/factchecks/[slug]/page.tsx"), "utf8");
    expect(page).toMatch(
      /<Suspense fallback=\{null\}>\s*<ProgrammeThemeBlock context=\{context\} \/>\s*<\/Suspense>/
    );
  });

  // One condition per block counted by isIndexableFactCheck().
  it.each(['"Candidacy"', '"Vote"', '"Measure"', '"themeReviewedAt"', '"FactCheckMention" m2'])(
    "counts the block read from %s",
    (signal) => {
      expect(factChecksShard).toContain(signal);
    }
  );
});

describe("doctrine — the Territoires shard mirrors isIndexableTerritoireCommune()", () => {
  const src = readFileSync(join(process.cwd(), "src/app/sitemap.ts"), "utf8");

  it("imports the population floor from the shared helper", () => {
    expect(src).toContain('from "@/lib/seo/territoire-robots"');
    expect(src).toContain("TERRITOIRE_COMMUNE_MIN_POPULATION");
  });

  // Scoped to the shard, comments stripped, like the scrutin guard above.
  const territoiresShard = (() => {
    const start = src.indexOf("async function buildTerritoiresSitemap");
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf("\n}", start);
    return src
      .slice(start, end)
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*|--)/.test(line))
      .join("\n");
  })();

  it("keeps an unknown population out (not presumed rich)", () => {
    expect(territoiresShard).toContain('c."population" IS NOT NULL');
    expect(territoiresShard).toContain('c."population" >= ${TERRITOIRE_COMMUNE_MIN_POPULATION}');
  });

  // getMaireStatus(): exactly one current MAIRE outside any PLM sector, on a public profile,
  // counted before the public filter.
  it.each([
    `m."type" = 'MAIRE'`,
    'm."isCurrent" = true',
    'ml."sectorLabel" IS NULL',
    "HAVING COUNT(*) = 1",
    'bool_and(p."publicationStatus" = ${PUBLIC_POLITICIAN_PUBLICATION_STATUS})',
  ])("filters the established mayor on %s", (signal) => {
    expect(territoiresShard).toContain(signal);
  });

  it("lists the dedicated elections page only for the same communes, and only with results", () => {
    // Readable address: the sitemap must announce the canonical URL, never the bare code that
    // only answers by a 308.
    expect(territoiresShard).toContain("territoireCommunePath(c.id, c.name)");
    expect(territoiresShard).toContain("territoireCommuneElectionsPath(c.id, c.name)");
    expect(territoiresShard).toContain("c.electionsLastmod != null");
    expect(territoiresShard).toContain('"CommuneElectionRound" r WHERE r."communeId" = c."id"');
    // The lastmod follows the results, not the mayor's mandate.
    expect(territoiresShard).toContain("lastModified: c.electionsLastmod");
  });

  it("gives the dedicated elections page the verdict of its commune page", () => {
    const page = readFileSync(
      join(process.cwd(), "src/app/territoires/communes/[code]/elections/page.tsx"),
      "utf8"
    );
    expect(page).toContain("territoireCommuneRobotsMetadata(data.indexSignals)");
    expect(page).toContain(
      "territoireCommuneElectionsPath(data.commune.inseeCode, data.commune.name)"
    );
  });

  it("never filters the mayors on publication before counting them", () => {
    const where = territoiresShard.slice(
      territoiresShard.indexOf("WHERE m."),
      territoiresShard.indexOf("GROUP BY")
    );
    expect(where).not.toContain("publicationStatus");
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

describe("doctrine — /_next/static build assets stay noindexed but crawlable", () => {
  const require = createRequire(import.meta.url);
  const { pathToRegexp } = require("next/dist/compiled/path-to-regexp") as {
    pathToRegexp: (path: string, keys?: unknown[], opts?: Record<string, unknown>) => RegExp;
  };
  const re = pathToRegexp(NEXT_STATIC_ROBOTS_SOURCE, [], {
    delimiter: "/",
    sensitive: false,
    strict: false,
  });

  it("tags every rule with X-Robots-Tag: noindex", () => {
    expect(NEXT_STATIC_NOINDEX_HEADERS.length).toBeGreaterThan(0);
    for (const rule of NEXT_STATIC_NOINDEX_HEADERS) {
      expect(rule.headers).toContainEqual({ key: "X-Robots-Tag", value: "noindex" });
    }
  });

  it("noindexes static build chunks", () => {
    expect(re.test("/_next/static/chunks/main-abc123.js")).toBe(true);
  });

  // robots.txt must never Disallow this prefix: Googlebot needs the CSS/JS to render
  // the page it is about to score, so the noindex header above is deliberately the
  // only lever here (see next-static-robots.ts).
  it("stays outside every robots.txt Disallow group", async () => {
    const robots = (await import("../../../app/robots")).default();
    const rules = Array.isArray(robots.rules) ? robots.rules : robots.rules ? [robots.rules] : [];
    for (const rule of rules) {
      const disallow = Array.isArray(rule.disallow)
        ? rule.disallow
        : rule.disallow
          ? [rule.disallow]
          : [];
      for (const pattern of disallow) {
        expect(pattern.startsWith("/_next/")).toBe(false);
      }
    }
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

describe("doctrine, /territoires/departements/[slug] : les vues de la liste des communes restent hors index", () => {
  it("?lettre= et ?page>1 sont des variantes utilitaires, la page nue reste indexable", async () => {
    const { DEPARTEMENT_COMMUNES_FILTER_KEYS } = await import("../listing-filters");
    expect(DEPARTEMENT_COMMUNES_FILTER_KEYS).toContain("lettre");
    expect(listingRobots({ lettre: "M" }, DEPARTEMENT_COMMUNES_FILTER_KEYS)).toEqual(
      NOINDEX_FOLLOW
    );
    expect(listingRobots({ page: "2" }, DEPARTEMENT_COMMUNES_FILTER_KEYS)).toEqual(NOINDEX_FOLLOW);
    expect(listingRobots({}, DEPARTEMENT_COMMUNES_FILTER_KEYS)).toEqual(INDEXABLE);
  });

  it("la route des variantes est noindex,follow avec un canonical vers la page nue", async () => {
    const { generateMetadata } =
      await import("@/app/territoires/departements/[slug]/communes/[lettre]/[page]/page");
    for (const [lettre, page] of [
      ["M", "2"],
      ["E", "1"],
      ["toutes", "3"],
    ]) {
      const m = await generateMetadata({
        params: Promise.resolve({ slug: "aisne", lettre: lettre!, page: page! }),
      });
      expect(m.robots, `${lettre}/${page}`).toEqual(NOINDEX_FOLLOW.robots);
      expect(m.alternates?.canonical).toBe("/territoires/departements/aisne");
    }
  });

  it("la page nue du département garde son canonical et reste indexable", async () => {
    const { generateMetadata } = await import("@/app/territoires/departements/[slug]/page");
    const m = await generateMetadata({ params: Promise.resolve({ slug: "aisne" }) });
    expect(m.robots).toBeUndefined();
    expect(m.alternates?.canonical).toBe("/territoires/departements/aisne");
  });

  it("aucune des deux routes ne lit searchParams (ISR, AGENTS.md §8)", () => {
    for (const file of [
      "src/app/territoires/departements/[slug]/page.tsx",
      "src/app/territoires/departements/[slug]/communes/[lettre]/[page]/page.tsx",
      "src/app/territoires/departements/[slug]/departement-page.tsx",
    ]) {
      const code = readFileSync(join(process.cwd(), file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");
      expect(code, file).not.toMatch(/searchParams/);
    }
  });
});

describe("doctrine — indexable routes the 2026-11-12 audit found missing from the sitemap", () => {
  const src = readFileSync(join(process.cwd(), "src/app/sitemap.ts"), "utf8");
  const code = src
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");

  it.each([
    "url: `${SITE_URL}/parlement/votes`,",
    "url: `${SITE_URL}/parlement/groupes`,",
    "url: `${SITE_URL}${ROUTES.governmentProjectsMethodology}`,",
    "url: `${SITE_URL}/procedures-baillons`,",
    "url: `${SITE_URL}/elections/municipales-2026/resultats`,",
    "url: `${SITE_URL}/elections/senatoriales-2026/college-electoral`,",
  ])("lists %s", (entry) => {
    expect(code).toContain(entry);
  });

  // Mirrors the /parlement/groupes listing: current legislature (from the shared constant, never
  // a literal) or Senate, and at least one current member.
  const dossiersShard = (() => {
    const start = code.indexOf("async function buildDossiersSitemap");
    expect(start).toBeGreaterThan(-1);
    return code.slice(start, code.indexOf("\n}", start));
  })();

  it("announces the group pages on the listing perimeter", () => {
    expect(dossiersShard).toContain("url: `${SITE_URL}/parlement/groupes/${g.slug}`");
    expect(dossiersShard).toContain("{ legislature: CURRENT_LEGISLATURE }, { legislature: null }");
    expect(dossiersShard).toContain("mandates: { some: { mandate: { isCurrent: true } } }");
    expect(dossiersShard).not.toMatch(/legislature: \d+/);
  });

  // Deliberately left out: the daily view (same content as a noindex date archive), the flagged chatbot, the
  // group evidence pages, and the 2026 municipal department pages (overlap with Territoires).
  it.each([
    "/parlement/votes/aujourd-hui",
    "/chat",
    "/projets-gouvernementaux",
    "/elections/municipales-2026/departements",
    "/parlement/votes?filter",
  ])("does not list %s", (fragment) => {
    expect(code).not.toContain(fragment);
  });
});

describe("doctrine : parrainages présidentiels", () => {
  const page = (path: string) =>
    readFileSync(join(process.cwd(), "src/app/elections/[slug]/parrainages", path), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
  const NOINDEX = "robots: { index: false, follow: true }";
  const tableau = {
    dernierePublication: "2022-03-07",
    candidats: [
      { slug: "pecresse-valerie", total: 2636 },
      { slug: "koenig-gaspard", total: PARRAINAGES_CANDIDAT_MIN_PRESENTATIONS },
      { slug: "kuzmanovic-georges", total: PARRAINAGES_CANDIDAT_MIN_PRESENTATIONS - 1 },
    ],
    departements: [{ code: "29" }, { code: "984" }],
  };

  it("page candidat indexable à partir du seuil", () => {
    expect(parrainagesCandidatRobotsMetadata(PARRAINAGES_CANDIDAT_MIN_PRESENTATIONS)).toEqual({});
    expect(isIndexableParrainagesCandidat(2636)).toBe(true);
  });

  it("page candidat sous le seuil : noindex, follow", () => {
    expect(parrainagesCandidatRobotsMetadata(PARRAINAGES_CANDIDAT_MIN_PRESENTATIONS - 1)).toEqual({
      robots: { index: false, follow: true },
    });
    expect(parrainagesCandidatRobotsMetadata(1)).toEqual({
      robots: { index: false, follow: true },
    });
  });

  it("la page candidat tient son verdict du prédicat partagé, sans valeur en dur", () => {
    const src = page("[candidat]/page.tsx");
    expect(src).toContain("parrainagesCandidatRobotsMetadata(detail.candidat.total)");
    expect(src).not.toContain(NOINDEX);
  });

  it("tableau de bord et pages département indexables", () => {
    expect(page("departements/[departement]/page.tsx")).not.toContain(NOINDEX);
    // The dashboard file also serves the waiting page of an election without a list.
    const dashboard = page("page.tsx");
    expect(dashboard.split(NOINDEX)).toHaveLength(2);
    expect(dashboard.indexOf(NOINDEX)).toBeLessThan(
      dashboard.indexOf("return {", dashboard.indexOf(NOINDEX))
    );
    expect(dashboard).toContain("slug in PARRAINAGES_A_VENIR");
  });

  it("page de méthode hors de l'index", () => {
    expect(page("methode/page.tsx")).toContain(NOINDEX);
  });

  it("aucune page par élu : aucune route sous un nom de parrain", () => {
    const dirs = readdirSync(join(process.cwd(), "src/app/elections/[slug]/parrainages"), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(dirs).toEqual(["[candidat]", "departements", "methode"]);
  });

  it("le sitemap liste le tableau de bord, les candidats au seuil et les départements, datés de la publication", () => {
    const entries = parrainagesSitemapEntries(
      "https://poligraph.fr",
      "presidentielle-2022",
      tableau
    );
    const base = "https://poligraph.fr/elections/presidentielle-2022/parrainages";
    expect(entries.map((entry) => entry.url)).toEqual([
      base,
      `${base}/pecresse-valerie`,
      `${base}/koenig-gaspard`,
      `${base}/departements/finistere`,
    ]);
    for (const entry of entries) {
      expect(entry.lastModified).toEqual(new Date("2022-03-07T00:00:00Z"));
    }
  });

  it("le sitemap ne liste rien tant qu'aucune présentation n'est publiée", () => {
    expect(
      parrainagesSitemapEntries("https://poligraph.fr", "presidentielle-2027", {
        dernierePublication: null,
        candidats: [],
        departements: [],
      })
    ).toEqual([]);
  });

  it("le sitemap passe par le prédicat partagé", () => {
    const src = readFileSync(join(process.cwd(), "src/app/sitemap.ts"), "utf8");
    expect(src).toContain('from "@/lib/seo/parrainages-robots"');
    expect(src).toContain("parrainagesSitemapEntries(SITE_URL, slug,");
  });
});

describe("doctrine : l'annuaire des candidats ne lit ni n'écrit de paramètre hors périmètre", () => {
  // A new key in the address (a sort, a view) creates a new URL of the same directory. It has to
  // be declared in PRESIDENTIAL_CANDIDATES_FILTER_KEYS, or that URL is indexable: `tri` shipped
  // without it in #1400. Comments are stripped so a key named in prose does not count.
  const code = readFileSync(
    join(
      process.cwd(),
      "src/app/elections/presidentielle-2027/_components/CandidacyFieldBrowser.tsx"
    ),
    "utf8"
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const keys = [...code.matchAll(/\.(?:get|set|delete)\(\s*"([^"]+)"/g)].map((match) => match[1]);

  it("trouve bien les paramètres du composant", () => {
    expect(new Set(keys)).toEqual(new Set(["q", "statut", "propositions", "tri"]));
  });

  it("déclare chacun d'eux dans le périmètre noindex", () => {
    for (const key of new Set(keys)) {
      expect(PRESIDENTIAL_CANDIDATES_FILTER_KEYS as readonly string[]).toContain(key);
    }
  });
});

describe("doctrine : un listing ne lit aucun paramètre d'adresse sans verdict d'indexation", () => {
  // Every key a listing page reads creates URLs of the same listing. Each one must either sit in
  // the listing's noindex perimeter (listing-filters.ts) or be named here with the reason its
  // verdict is decided elsewhere in the page. A key added to the page's `searchParams` type
  // without one of the two fails this test, before the URL can reach the index.
  const READ_BY_LISTING = [
    {
      route: "/affaires",
      page: "src/app/affaires/page.tsx",
      keys: AFFAIRES_LISTING_FILTER_KEYS,
      // page: hasActiveListingFilter() pagination. mode: `hasNonDefaultMode`.
      decidedInPage: ["page", "mode"],
    },
    {
      route: "/politiques",
      page: "src/app/politiques/page.tsx",
      keys: POLITIQUES_LISTING_FILTER_KEYS,
      // conviction, financing: `hasConvictionFilter`. sort: `hasNonDefaultSort`.
      decidedInPage: ["page", "conviction", "financing", "sort"],
    },
    {
      route: "/parlement/votes",
      page: "src/app/parlement/votes/page.tsx",
      keys: VOTES_LISTING_FILTER_KEYS,
      // filter: the bare ?filter=expliques view is indexable on purpose (`isBareExplainedView`).
      decidedInPage: ["page", "filter"],
    },
    {
      route: "/elections/presidentielle-2027/affaires-judiciaires",
      page: "src/app/elections/presidentielle-2027/affaires-judiciaires/page.tsx",
      keys: PRESIDENTIAL_AFFAIRS_FILTER_KEYS,
      decidedInPage: ["page"],
    },
    {
      route: "/elections/presidentielle-2027/affaires-judiciaires",
      page: "src/app/elections/presidentielle-2027/affaires-judiciaires/page.tsx",
      keys: PRESIDENTIAL_AFFAIRS_FILTER_KEYS,
      decidedInPage: ["page"],
    },
    {
      route: "/parlement/dossiers",
      page: "src/app/parlement/dossiers/page.tsx",
      keys: DOSSIERS_LISTING_FILTER_KEYS,
      decidedInPage: ["page"],
    },
  ];

  function declaredKeys(file: string): string[] {
    const code = readFileSync(join(process.cwd(), file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const block = code.match(/searchParams\??:\s*Promise<\{([\s\S]*?)\}>/)?.[1];
    // An untyped `Record<string, …>` would hide every key from this guard.
    if (block === undefined) throw new Error(`${file} : searchParams sans clés déclarées`);
    return [...block.matchAll(/(\w+)\??:/g)].map((match) => match[1]!);
  }

  it.each(READ_BY_LISTING)(
    "$route : chaque paramètre lu est hors index ou décidé dans la page",
    ({ page, keys, decidedInPage }) => {
      const declared = declaredKeys(page);
      expect(declared.length).toBeGreaterThan(0);
      const known = new Set<string>([...keys, ...decidedInPage]);
      expect(declared.filter((key) => !known.has(key))).toEqual([]);
    }
  );

  it.each(READ_BY_LISTING)(
    "$route : la liste des exceptions ne nomme que des paramètres encore lus",
    ({ page, decidedInPage }) => {
      const declared = new Set(declaredKeys(page));
      expect(decidedInPage.filter((key) => !declared.has(key))).toEqual([]);
    }
  );
});
