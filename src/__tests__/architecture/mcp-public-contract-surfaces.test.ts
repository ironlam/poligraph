import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  allAffairsAtTimeRelationsArePublic,
  analyzeSurface,
  createFileSystemSourceHost,
  createMemorySourceHost,
  discoverPublicEntrypoints,
  inspectAffairsAtTimeRelations,
  NON_PUBLIC_ENTRYPOINTS,
  validateReviewedInventory,
  type ReviewedSurfaceInventory,
  type SensitiveDomain,
  type SurfaceAnalysis,
} from "./mcp-public-surface-graph";

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function readSource(path: string): string {
  return withoutComments(readFileSync(path, "utf8"));
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function section(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex, `section start missing: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `section end missing: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

function executionBlock(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker);
  expect(markerIndex, `execution marker missing: ${marker}`).toBeGreaterThanOrEqual(0);
  const openBrace = source.indexOf("{", markerIndex);
  expect(openBrace, `opening brace missing after: ${marker}`).toBeGreaterThan(markerIndex);

  let depth = 0;
  for (let index = openBrace; index < source.length; index++) {
    if (source[index] === "{") depth++;
    if (source[index] === "}") depth--;
    if (depth === 0) return source.slice(openBrace, index + 1);
  }

  throw new Error(`unterminated execution block: ${marker}`);
}

const PARTY_SURFACES = [
  "src/app/affaires/[slug]/page.tsx",
  "src/app/affaires/condamnations/page.tsx",
  "src/app/affaires/page.tsx",
  "src/app/affaires/parti/[slug]/page.tsx",
  "src/app/api/activity/batch/route.ts",
  "src/app/api/affaires/neighbors/route.ts",
  "src/app/api/affaires/route.ts",
  "src/app/api/carte/route.ts",
  "src/app/api/chat/route.ts",
  "src/app/api/compare/search-index/route.ts",
  "src/app/api/compare/suggestions/route.ts",
  "src/app/api/deputies/by-commune/route.ts",
  "src/app/api/deputies/by-department/route.ts",
  "src/app/api/elections/[slug]/candidacies/route.ts",
  "src/app/api/elections/[slug]/measures/route.ts",
  "src/app/api/elections/[slug]/route.ts",
  "src/app/api/elections/presidentielle-2027/recherche/route.ts",
  "src/app/api/export/affaires/route.ts",
  "src/app/api/export/factchecks/route.ts",
  "src/app/api/export/politiques/route.ts",
  "src/app/api/factchecks/route.ts",
  "src/app/api/factchecks/stats/route.ts",
  "src/app/api/partis/[slug]/route.ts",
  "src/app/api/partis/route.ts",
  "src/app/api/politiques/[slug]/affaires/route.ts",
  "src/app/api/politiques/[slug]/factchecks/route.ts",
  "src/app/api/politiques/[slug]/relations/route.ts",
  "src/app/api/politiques/[slug]/route.ts",
  "src/app/api/politiques/[slug]/votes/route.ts",
  "src/app/api/politiques/route.ts",
  "src/app/api/reconcile/route.ts",
  "src/app/api/search/advanced/route.ts",
  "src/app/api/search/filters/route.ts",
  "src/app/api/search/global/route.ts",
  "src/app/api/search/parties/route.ts",
  "src/app/api/search/politicians/route.ts",
  "src/app/api/search/watchlist/route.ts",
  "src/app/api/stats/departments/route.ts",
  "src/app/api/stats/route.ts",
  "src/app/api/v1/communes/[codeInsee]/route.ts",
  "src/app/api/v1/elus/[id]/route.ts",
  "src/app/api/v1/elus/route.ts",
  "src/app/api/v1/elus/search/route.ts",
  "src/app/api/votes/stats/route.ts",
  "src/app/carte/page.tsx",
  "src/app/comparer/page.tsx",
  "src/app/comparer/votes/page.tsx",
  "src/app/declarations-et-patrimoine/page.tsx",
  "src/app/departements/[slug]/page.tsx",
  "src/app/elections/[slug]/page.tsx",
  "src/app/elections/municipales-2026/carte/page.tsx",
  "src/app/elections/municipales-2026/communes/[inseeCode]/page.tsx",
  "src/app/elections/municipales-2026/cumul/page.tsx",
  "src/app/elections/municipales-2026/departements/[code]/page.tsx",
  "src/app/elections/municipales-2026/maires/page.tsx",
  "src/app/elections/municipales-2026/page.tsx",
  "src/app/elections/municipales-2026/parite/page.tsx",
  "src/app/elections/municipales-2026/resultats/page.tsx",
  "src/app/elections/presidentielle-2027/candidats/[slug]/mesures/page.tsx",
  "src/app/elections/presidentielle-2027/candidats/[slug]/page.tsx",
  "src/app/elections/presidentielle-2027/candidats/page.tsx",
  "src/app/elections/presidentielle-2027/comparer/page.tsx",
  "src/app/elections/presidentielle-2027/mesures/[id]/page.tsx",
  "src/app/elections/presidentielle-2027/page.tsx",
  "src/app/elections/presidentielle-2027/priorites/page.tsx",
  "src/app/elections/presidentielle-2027/recherche/page.tsx",
  "src/app/elections/presidentielle-2027/reperes/[slug]/page.tsx",
  "src/app/elections/presidentielle-2027/reperes/page.tsx",
  "src/app/elections/presidentielle-2027/themes/[theme]/page.tsx",
  "src/app/elections/presidentielle-2027/themes/page.tsx",
  "src/app/factchecks/[slug]/page.tsx",
  "src/app/factchecks/page.tsx",
  "src/app/page.tsx",
  "src/app/parlement/dossiers/[slug]/page.tsx",
  "src/app/parlement/dossiers/page.tsx",
  "src/app/parlement/groupes/[slug]/page.tsx",
  "src/app/parlement/groupes/page.tsx",
  "src/app/parlement/page.tsx",
  "src/app/parlement/votes/[slug]/page.tsx",
  "src/app/parlement/votes/page.tsx",
  "src/app/partis/[slug]/opengraph-image.tsx",
  "src/app/partis/[slug]/page.tsx",
  "src/app/partis/[slug]/programme/opengraph-image.tsx",
  "src/app/partis/[slug]/programme/page.tsx",
  "src/app/partis/page.tsx",
  "src/app/politiques/[slug]/opengraph-image.tsx",
  "src/app/politiques/[slug]/page.tsx",
  "src/app/politiques/[slug]/relations/page.tsx",
  "src/app/politiques/[slug]/votes/page.tsx",
  "src/app/politiques/page.tsx",
  "src/app/presse/page.tsx",
  "src/app/programmes/page.tsx",
  "src/app/recap/[week]/opengraph-image.tsx",
  "src/app/recap/[week]/page.tsx",
  "src/app/recap/page.tsx",
  "src/app/statistiques/factchecks/page.tsx",
  "src/app/statistiques/legislatif/page.tsx",
  "src/app/statistiques/page.tsx",
  "src/app/statistiques/participation/page.tsx",
] as const;

const FACTCHECK_SURFACES = [
  "src/app/api/chat/route.ts",
  "src/app/api/export/factchecks/route.ts",
  "src/app/api/export/politiques/route.ts",
  "src/app/api/factchecks/route.ts",
  "src/app/api/factchecks/stats/route.ts",
  "src/app/api/politiques/[slug]/factchecks/route.ts",
  "src/app/api/politiques/[slug]/route.ts",
  "src/app/api/politiques/route.ts",
  "src/app/api/rss/factchecks.xml/route.ts",
  "src/app/api/search/global/route.ts",
  "src/app/api/stats/route.ts",
  "src/app/comparer/page.tsx",
  "src/app/elections/presidentielle-2027/candidats/[slug]/mesures/page.tsx",
  "src/app/elections/presidentielle-2027/candidats/[slug]/page.tsx",
  "src/app/factchecks/[slug]/opengraph-image.tsx",
  "src/app/factchecks/[slug]/page.tsx",
  "src/app/factchecks/page.tsx",
  "src/app/page.tsx",
  "src/app/politiques/[slug]/page.tsx",
  "src/app/politiques/[slug]/relations/page.tsx",
  "src/app/politiques/[slug]/votes/page.tsx",
  "src/app/recap/[week]/opengraph-image.tsx",
  "src/app/recap/[week]/page.tsx",
  "src/app/recap/page.tsx",
  "src/app/statistiques/factchecks/page.tsx",
  "src/app/statistiques/legislatif/page.tsx",
  "src/app/statistiques/page.tsx",
  "src/app/statistiques/participation/page.tsx",
] as const;

const AFFAIR_SURFACES = [
  "src/app/affaires/[slug]/opengraph-image.tsx",
  "src/app/affaires/[slug]/page.tsx",
  "src/app/affaires/condamnations/opengraph-image.tsx",
  "src/app/affaires/condamnations/page.tsx",
  "src/app/affaires/page.tsx",
  "src/app/affaires/parti/[slug]/page.tsx",
  "src/app/api/activity/batch/route.ts",
  "src/app/api/affaires/neighbors/route.ts",
  "src/app/api/affaires/route.ts",
  "src/app/api/chat/route.ts",
  "src/app/api/elections/senatoriales-2026/commune/route.ts",
  "src/app/api/export/affaires/route.ts",
  "src/app/api/export/politiques/route.ts",
  "src/app/api/partis/[slug]/route.ts",
  "src/app/api/politiques/[slug]/affaires/route.ts",
  "src/app/api/politiques/[slug]/route.ts",
  "src/app/api/politiques/route.ts",
  "src/app/api/rss/affaires.xml/route.ts",
  "src/app/api/search/advanced/route.ts",
  "src/app/api/search/filters/route.ts",
  "src/app/api/search/global/route.ts",
  "src/app/api/stats/route.ts",
  "src/app/comparer/page.tsx",
  "src/app/elections/[slug]/page.tsx",
  "src/app/elections/municipales-2026/carte/page.tsx",
  "src/app/elections/municipales-2026/communes/[inseeCode]/page.tsx",
  "src/app/elections/municipales-2026/cumul/page.tsx",
  "src/app/elections/municipales-2026/departements/[code]/page.tsx",
  "src/app/elections/municipales-2026/maires/page.tsx",
  "src/app/elections/municipales-2026/page.tsx",
  "src/app/elections/municipales-2026/parite/page.tsx",
  "src/app/elections/municipales-2026/resultats/page.tsx",
  "src/app/elections/presidentielle-2027/candidats/[slug]/mesures/page.tsx",
  "src/app/elections/presidentielle-2027/candidats/[slug]/page.tsx",
  "src/app/elections/senatoriales-2026/college-electoral/page.tsx",
  "src/app/elections/senatoriales-2026/page.tsx",
  "src/app/page.tsx",
  "src/app/partis/[slug]/page.tsx",
  "src/app/partis/[slug]/programme/page.tsx",
  "src/app/partis/page.tsx",
  "src/app/politiques/[slug]/page.tsx",
  "src/app/politiques/[slug]/relations/page.tsx",
  "src/app/politiques/[slug]/votes/page.tsx",
  "src/app/politiques/page.tsx",
  "src/app/procedures-baillons/page.tsx",
  "src/app/recap/[week]/opengraph-image.tsx",
  "src/app/recap/[week]/page.tsx",
  "src/app/recap/page.tsx",
  "src/app/statistiques/factchecks/page.tsx",
  "src/app/statistiques/legislatif/page.tsx",
  "src/app/statistiques/page.tsx",
  "src/app/statistiques/participation/page.tsx",
] as const;

const PARTY_AFFAIRS_AT_TIME_SURFACES = new Set([
  "src/app/partis/[slug]/page.tsx",
  "src/app/partis/[slug]/programme/page.tsx",
  "src/app/partis/page.tsx",
]);

const DOMAIN_REVIEW_INVARIANT: Record<SensitiveDomain, string> = {
  Party: "PARTY_ACCESS_REVIEWED",
  FactCheck: "FACTCHECK_ACCESS_REVIEWED",
  Affair: "AFFAIR_ACCESS_REVIEWED",
};
const PARTY_AFFAIRS_AT_TIME_INVARIANT = "PARTY_AFFAIRS_AT_TIME_PUBLIC_POLITICIAN";

const INVARIANT_CONTROLS: Record<
  string,
  (analysis: SurfaceAnalysis, domain: SensitiveDomain) => boolean
> = {
  PARTY_ACCESS_REVIEWED: (analysis) => analysis.domains.has("Party"),
  FACTCHECK_ACCESS_REVIEWED: (analysis) => analysis.domains.has("FactCheck"),
  AFFAIR_ACCESS_REVIEWED: (analysis) => analysis.domains.has("Affair"),
  [PARTY_AFFAIRS_AT_TIME_INVARIANT]: (analysis, domain) => {
    const partyData = analysis.sources.get("src/lib/data/partis.ts");
    if (domain !== "Affair" || !partyData) return false;
    return allAffairsAtTimeRelationsArePublic(partyData, 2);
  },
};

function reviewed(
  domain: SensitiveDomain,
  paths: readonly string[]
): Record<string, readonly string[]> {
  return Object.fromEntries(
    paths.map((path) => [
      path,
      [
        DOMAIN_REVIEW_INVARIANT[domain],
        ...(domain === "Affair" && PARTY_AFFAIRS_AT_TIME_SURFACES.has(path)
          ? [PARTY_AFFAIRS_AT_TIME_INVARIANT]
          : []),
      ],
    ])
  );
}

const REVIEWED_SURFACES: ReviewedSurfaceInventory = {
  Party: reviewed("Party", PARTY_SURFACES),
  FactCheck: reviewed("FactCheck", FACTCHECK_SURFACES),
  Affair: reviewed("Affair", AFFAIR_SURFACES),
};

/*
 * Deliberate limits: this guard inventories sensitive public surfaces and checks a small set of
 * targeted structural invariants. It is a local static import graph, not a semantic proof of every
 * nested Prisma relation. It follows relative and @/ imports, ignores type-only, external and
 * generated imports, and conservatively treats every runtime local import as reachable from its
 * entrypoint. Database aliases propagate only through direct identifier declarations or
 * assignments. Literal element keys are supported, while computed dynamic model keys and general
 * data-flow analysis are not.
 */

describe("MCP-01 public contract surfaces", () => {
  const publicEntrypoints = discoverPublicEntrypoints();
  const sourceHost = createFileSystemSourceHost();
  const surfaceAnalyses = publicEntrypoints.map((entrypoint) =>
    analyzeSurface(entrypoint, sourceHost)
  );
  const rssFactchecks = readSource("src/app/api/rss/factchecks.xml/route.ts");
  const globalSearch = readSource("src/app/api/search/global/route.ts");
  const globalStats = readSource("src/app/api/stats/route.ts");
  const factcheckExport = readSource("src/app/api/export/factchecks/route.ts");
  const affairExport = readSource("src/app/api/export/affaires/route.ts");
  const affairsRoute = readSource("src/app/api/affaires/route.ts");
  const politicianAffairsRoute = readSource("src/app/api/politiques/[slug]/affaires/route.ts");
  const publicContract = readSource("src/lib/api/public-contract.ts");
  const politicianService = readSource("src/services/politicians/index.ts");
  const searchService = readSource("src/services/search.ts");
  const factcheckStats = readSource("src/services/factcheckStats.ts");
  const factcheckData = readSource("src/lib/data/factchecks.ts");
  const factcheckDetail = readSource("src/app/factchecks/[slug]/page.tsx");
  const politicianExport = readSource("src/app/api/export/politiques/route.ts");
  const affairsRss = readSource("src/app/api/rss/affaires.xml/route.ts");
  const affairOgImage = readSource("src/app/affaires/[slug]/opengraph-image.tsx");
  const partiesRoute = readSource("src/app/api/partis/route.ts");
  const partyDetailRoute = readSource("src/app/api/partis/[slug]/route.ts");
  const dedicatedPartySearch = readSource("src/app/api/search/parties/route.ts");
  const compareSearchIndex = readSource("src/app/api/compare/search-index/route.ts");
  const electionDetailRoute = readSource("src/app/api/elections/[slug]/route.ts");
  const partyData = readSource("src/lib/data/partis.ts");
  const partyPage = readSource("src/app/partis/[slug]/page.tsx");
  const partyOgImage = readSource("src/app/partis/[slug]/opengraph-image.tsx");
  const factcheckOgImage = readSource("src/app/factchecks/[slug]/opengraph-image.tsx");
  const recapData = readSource("src/lib/data/recap.ts");
  const recapView = readSource("src/components/recap/RecapView.tsx");
  const recapOgImage = readSource("src/app/recap/[week]/opengraph-image.tsx");
  const chatRoute = readSource("src/app/api/chat/route.ts");
  const compareData = readSource("src/lib/data/compare.ts");
  const maturity = readSource("src/config/judicial-maturity.ts");
  const schemas = read("src/lib/openapi/schemas.ts");

  it("routes every changed public fact-check surface through the canonical predicate", () => {
    const staticParams = section(
      factcheckDetail,
      "export async function generateStaticParams()",
      "interface PageProps"
    );
    const detailLoader = section(
      factcheckDetail,
      "async function getFactCheck(slug: string)",
      "export async function generateMetadata"
    );

    expect(rssFactchecks).toContain("where: getPublicFactCheckWhere()");
    expect(globalStats).toContain("where: getPublicFactCheckWhere()");
    expect(globalSearch).toContain("getPublicFactCheckSqlWhere()");
    expect(globalSearch).toContain('unaccent(fc."title") ILIKE unaccent(${pattern})');
    expect(factcheckExport).toContain("getPublicFactCheckWhere(source ?? undefined)");
    expect(staticParams).toContain("...getPublicFactCheckWhere()");
    expect(detailLoader).toContain("...getPublicFactCheckWhere()");
    expect(detailLoader).toContain("politician: PUBLIC_POLITICIAN_WHERE");
    expect(politicianExport).toContain("factCheck: getPublicFactCheckWhere()");

    expect(globalSearch).toContain("p.\"publicationStatus\" = 'PUBLISHED'");
    expect(factcheckExport).toContain('where: { politician: { publicationStatus: "PUBLISHED" } }');
  });

  it("keeps canonical fact-check helpers shared by data and statistics services", () => {
    expect(politicianService).toContain("factCheck: getPublicFactCheckWhere()");
    expect(factcheckData).toContain("where: getPublicFactCheckWhere()");
    expect(factcheckData).toContain("factCheck: getPublicFactCheckWhere()");
    expect(factcheckStats).toContain("const publicWhere = getPublicFactCheckWhere();");
    expect(factcheckStats).toContain("getPublicFactCheckSqlWhere()");
    expect(factcheckStats).toContain('getPublicFactCheckSqlWhere("fc2")');
    expect(factcheckStats).not.toContain("Prisma.join(FACTCHECK_ALLOWED_SOURCES)");
  });

  it("keeps the raw SQL fact-check gate derived from the same public constants", () => {
    expect(publicContract).toContain('PUBLIC_FACTCHECK_PUBLICATION_STATUS = "PUBLISHED"');
    expect(publicContract).toContain("PUBLIC_FACTCHECK_SOURCES = FACTCHECK_ALLOWED_SOURCES");
    expect(publicContract).toContain('alias: "fc" | "fc2" = "fc"');
    expect(publicContract).toContain("Prisma.join(PUBLIC_FACTCHECK_SOURCES)");
  });

  it("withholds parties that have no published politician on every public surface", () => {
    const partyQuery = section(
      partyDetailRoute,
      "const party = await db.party.findFirst",
      "if (!party)"
    );

    expect(publicContract).toContain("PUBLIC_PARTY_WHERE");
    expect(publicContract).toContain("getPublicPartySqlWhere");
    expect(partiesRoute).toMatch(
      /const where: Prisma\.PartyWhereInput = \{\s*\.\.\.PUBLIC_PARTY_WHERE,/
    );
    expect(partyQuery).toMatch(/where: \{\s*slug,\s*\.\.\.PUBLIC_PARTY_WHERE\s*\}/);
    expect(partyQuery).toMatch(
      /predecessor: \{[\s\S]*politicians: \{\s*where: PUBLIC_POLITICIAN_WHERE\s*\}/
    );
    expect(partyQuery).toMatch(/successors: \{\s*where: PUBLIC_PARTY_WHERE,/);
    expect(globalSearch).toMatch(
      /WHERE \$\{getPublicPartySqlWhere\(\)\}\s*AND \(unaccent\(p\."name"\)[\s\S]*OR unaccent\(p\."shortName"\)[\s\S]*\)\)/
    );
  });

  it("keeps every reviewed Party surface inside its relevant execution block", () => {
    const statsHandler = executionBlock(globalStats, "export const GET = withPublicRoute");
    const partySearchHandler = executionBlock(
      dedicatedPartySearch,
      "export const GET = withPublicRoute"
    );
    const compareIndexLoader = executionBlock(compareSearchIndex, "async function getSearchIndex");
    const electionHandler = executionBlock(
      electionDetailRoute,
      "export const GET = withPublicRoute"
    );
    const partyLoader = executionBlock(partyData, "export const getParty = cache");
    const partyStaticParams = executionBlock(
      partyPage,
      "export async function generateStaticParams"
    );
    const partyPageHandler = partyPage.slice(
      partyPage.indexOf("export default async function PartyPage")
    );
    const partyOgHandler = partyOgImage.slice(
      partyOgImage.indexOf("export default async function Image")
    );
    const partyPreview = executionBlock(compareData, "async function getPartyPreview");

    expect(statsHandler).toContain("db.party.count({ where: PUBLIC_PARTY_WHERE })");
    expect(partySearchHandler).toContain("...PUBLIC_PARTY_WHERE");
    expect(partySearchHandler).toContain("politicians: { where: PUBLIC_POLITICIAN_WHERE }");
    expect(compareIndexLoader).toContain("...PUBLIC_PARTY_WHERE");
    expect(compareIndexLoader).toContain("politicians: { where: PUBLIC_POLITICIAN_WHERE }");
    expect(electionHandler).toContain("politicians: { where: PUBLIC_POLITICIAN_WHERE }");
    expect(electionHandler).toContain("candidacy.party._count.politicians > 0");
    expect(partyLoader).toContain("where: { slug, ...PUBLIC_PARTY_WHERE }");
    expect(partyLoader).toContain("successors: { where: PUBLIC_PARTY_WHERE }");
    expect(partyLoader).toContain("party.predecessor._count.politicians > 0");
    expect(partyStaticParams).toContain("where: PUBLIC_PARTY_WHERE");
    expect(partyPageHandler).toContain("getParty(slug)");
    expect(partyPageHandler).toContain("notFound()");
    expect(partyOgHandler).toContain("...PUBLIC_PARTY_WHERE");
    expect(partyOgHandler).toContain("notFound()");
    expect(partyPreview).toContain("...PUBLIC_PARTY_WHERE");
  });

  it("keeps every reviewed FactCheck surface inside its relevant execution block", () => {
    const factcheckOgHandler = factcheckOgImage.slice(
      factcheckOgImage.indexOf("export default async function Image")
    );
    const recapQuery = executionBlock(recapData, "async function queryWeeklyRecap");
    const chatStats = section(
      chatRoute,
      "async function getGlobalStats",
      "const MAX_CONTEXT_LENGTH"
    );
    const politicianComparison = section(
      compareData,
      "const POLITICIAN_COMPARISON_SELECT",
      "export type PoliticianComparisonData"
    );

    expect(factcheckOgHandler).toContain("...getPublicFactCheckWhere()");
    expect(factcheckOgHandler).toContain("notFound()");
    expect(recapQuery).toContain("...getPublicFactCheckWhere()");
    expect(recapQuery).toContain("getPublicFactCheckSqlWhere()");
    expect(recapQuery).toContain('p."publicationStatus" = ${PUBLIC_POLITICIAN_PUBLICATION_STATUS}');
    expect(chatStats).toContain("getPublicFactCheckSqlWhere()");
    expect(politicianComparison).toContain("factCheck: getPublicFactCheckWhere()");
  });

  it("keeps the recap and chat Affair boundary in query blocks shared by every consumer", () => {
    const recapQuery = executionBlock(recapData, "async function queryWeeklyRecap");
    const chatStats = section(
      chatRoute,
      "async function getGlobalStats",
      "const MAX_CONTEXT_LENGTH"
    );

    expect(recapQuery).toContain("getPublishedAffairSqlWhere()");
    expect(recapQuery).toContain('p."publicationStatus" = ${PUBLIC_POLITICIAN_PUBLICATION_STATUS}');
    expect(chatStats).toContain("getPublishedAffairSqlWhere()");
    expect(chatStats).toContain('public_affair_politician."publicationStatus"');
    expect(recapView).toContain("data.affairs.newAffairs.map");
    expect(recapOgImage).toContain("getWeeklyRecap(weekStart)");
  });

  it("discovers and controls every sensitive public API, page and Open Graph entrypoint", () => {
    expect(publicEntrypoints).toContain("src/app/api/stats/route.ts");
    expect(publicEntrypoints).toContain("src/app/partis/page.tsx");
    expect(publicEntrypoints).toContain("src/app/partis/[slug]/opengraph-image.tsx");
    expect(publicEntrypoints.some((path) => path.startsWith("src/app/admin/"))).toBe(false);
    for (const excluded of NON_PUBLIC_ENTRYPOINTS)
      expect(publicEntrypoints).not.toContain(excluded);

    expect(validateReviewedInventory(surfaceAnalyses, REVIEWED_SURFACES)).toEqual([]);

    for (const domain of ["Party", "FactCheck", "Affair"] as const) {
      for (const [path, invariants] of Object.entries(REVIEWED_SURFACES[domain])) {
        const analysis = surfaceAnalyses.find((candidate) => candidate.entrypoint === path);
        expect(analysis, path).toBeDefined();
        expect(invariants.length).toBeGreaterThan(0);
        for (const invariant of invariants) {
          const control = INVARIANT_CONTROLS[invariant];
          if (!control) throw new Error(`${path}: uncontrolled invariant ${invariant}`);
          expect(control(analysis!, domain), `${path}: failed invariant ${invariant}`).toBe(true);
        }
      }
    }
  });

  it("controls both affairsAtTime relations inside their own Prisma blocks", () => {
    const relations = inspectAffairsAtTimeRelations(read("src/lib/data/partis.ts"));
    expect(relations).toHaveLength(2);
    expect(relations).toEqual([
      { hasPublishedAffairWhere: true, hasPublicPoliticianWhere: true },
      { hasPublishedAffairWhere: true, hasPublicPoliticianWhere: true },
    ]);
    expect(allAffairsAtTimeRelationsArePublic(read("src/lib/data/partis.ts"), 2)).toBe(true);

    for (const path of PARTY_AFFAIRS_AT_TIME_SURFACES) {
      const analysis = surfaceAnalyses.find((candidate) => candidate.entrypoint === path);
      expect(analysis?.sources.has("src/lib/data/partis.ts"), path).toBe(true);
      expect(REVIEWED_SURFACES.Affair[path]).toContain(PARTY_AFFAIRS_AT_TIME_INVARIANT);
    }
  });

  it("keeps structured CSV filters fail-closed instead of treating empty as absent", () => {
    expect(factcheckExport).toContain("source !== null && !isAllowedFactCheckSource(source)");
    expect(factcheckExport).toContain(
      "verdict !== null && !Object.values(FactCheckRating).includes(verdict as FactCheckRating)"
    );
    expect(factcheckExport).toContain("politicianSlug !== null && politicianSlug.length === 0");

    expect(affairExport).toContain(
      "status !== null && !Object.values(AffairStatus).includes(status as AffairStatus)"
    );
    expect(affairExport).toContain(
      "category !== null && !Object.values(AffairCategory).includes(category as AffairCategory)"
    );
    expect(affairExport).toContain("politicianId !== null && politicianId.length === 0");
  });

  it("uses the centralized judicial publication builder on changed public affair surfaces", () => {
    expect(affairsRoute).toContain("...getPublishedAffairWhere()");
    expect(politicianAffairsRoute).toContain("...getPublishedAffairWhere()");
    expect(affairExport).toContain("...getPublishedAffairWhere()");
    expect(affairsRss).toContain("...getPublishedAffairWhere()");
    expect(affairsRss).toContain("politician: PUBLIC_POLITICIAN_WHERE");
    expect(affairOgImage).toContain("...getPublishedAffairWhere()");
    expect(affairOgImage).toContain("politician: PUBLIC_POLITICIAN_WHERE");
    expect(partyDetailRoute).toContain("affairs: { where: getPublishedAffairWhere() }");
    expect(politicianService).toContain("getPublishedAffairWhere()");
    expect(searchService).toContain("affairs: { some: getPublishedAffairWhere() }");
    expect(searchService).toContain("affairs: { none: getPublishedAffairWhere() }");
    expect(searchService).toContain("affairs: { where: getPublishedAffairWhere() }");
    expect(publicContract).not.toContain("PUBLIC_AFFAIR_WHERE");
  });

  it("does not count public affairs attached to unpublished politicians in global stats", () => {
    expect(globalStats).toContain("...getPublishedAffairWhere()");
    expect(globalStats).toContain("politician: PUBLIC_POLITICIAN_WHERE");
  });

  it("does not infer public global-search metadata from unpublished politicians", () => {
    expect(globalSearch).toContain("pol.\"publicationStatus\" = 'PUBLISHED'");
    expect(globalSearch).toContain("AND pol.\"publicationStatus\" = 'PUBLISHED'");
    expect(globalSearch).toContain("p.\"publicationStatus\" = 'PUBLISHED'");
  });

  it("publishes role-aware affair safeguards in the OpenAPI component", () => {
    const affairSchema = section(schemas, " *     Affair:\n", " *     Scrutin:\n");
    expect(affairSchema).toContain(" *         involvement:\n");
    expect(affairSchema).toContain(" *         semantics:\n");
    expect(affairSchema).toContain(" *             statusAppliesToPolitician:\n");
    expect(affairSchema).toContain(" *             needsPresumption:\n");
    expect(affairSchema).toContain(" *             certaintyLevel:\n");
    expect(affairSchema).toContain(" *               nullable: true\n");
    expect(affairSchema).toContain(" *             judicialMaturity:\n");
  });

  it("publishes mandate start-date provenance in APIs and the politician CSV", () => {
    expect(politicianExport).toContain("getMandateStartDatePublicationStatus(mandate.type)");
    expect(politicianExport).toMatch(
      /currentMandateStartPublicationStatus:\s*mandate\s*\?\s*getMandateStartDatePublicationStatus\(mandate\.type\)\s*:\s*""/
    );

    const startHeader = politicianExport.indexOf('header: "Début du mandat"');
    const statusHeader = politicianExport.indexOf(
      'header: "Statut de publication du début de mandat"'
    );
    const endHeader = politicianExport.indexOf('header: "Fin du mandat"');
    expect(startHeader).toBeGreaterThanOrEqual(0);
    expect(statusHeader).toBeGreaterThan(startHeader);
    expect(endHeader).toBeGreaterThan(statusHeader);

    const mandateSchema = section(schemas, " *     Mandate:\n", " *     Declaration:\n");
    const mandateSummarySchema = section(
      schemas,
      " *     MandateSummary:\n",
      " *     ElectionSummary:\n"
    );

    for (const mandateSection of [mandateSchema, mandateSummarySchema]) {
      expect(mandateSection).toContain(
        " *         id:\n *           type: string\n *           format: cuid\n"
      );
      expect(mandateSection).toContain(" *         startDatePublicationStatus:\n");
      expect(mandateSection).toContain(" *           enum: [AVAILABLE, UNVERIFIED]\n");
      expect(mandateSection).toContain("VICE_PRESIDENT_REGION");
      expect(mandateSection).toContain("VICE_PRESIDENT_DEPARTEMENT");
    }
  });

  it("documents every Prisma-backed identifier as a CUID", () => {
    expect(schemas).not.toContain("format: uuid");

    const cuidComponents = [
      ["PoliticianSummary", "Politician"],
      ["Politician", "Mandate"],
      ["Mandate", "Declaration"],
      ["Declaration", "PoliticianDetails"],
      ["PoliticianDetails", "Source"],
      ["Source", "Affair"],
      ["Affair", "FactCheck"],
      ["FactCheck", "Scrutin"],
      ["Scrutin", "Vote"],
      ["Vote", "VoteStats"],
      ["SearchResult", "Party"],
      ["Party", "PartyDetails"],
      ["PartyDetails", "MandateSummary"],
      ["MandateSummary", "ElectionSummary"],
      ["ElectionSummary", "ElectionDetails"],
      ["ElectionDetails", "Error"],
    ] as const;

    for (const [component, nextComponent] of cuidComponents) {
      const componentSchema = section(
        schemas,
        ` *     ${component}:\n`,
        ` *     ${nextComponent}:\n`
      );
      expect(componentSchema, component).toContain(
        " *         id:\n *           type: string\n *           format: cuid\n"
      );
    }
  });

  it("keeps the canonical public judicial maturity wording", () => {
    expect(maturity).toContain('INSTRUCTION_CLOSE: "Instruction clôturée sans mise en examen"');
  });
});

describe("MCP-01 public surface graph mutation fixtures", () => {
  function fixtureAnalysis(entrypoint: string, sources: Record<string, string>) {
    return analyzeSurface(entrypoint, createMemorySourceHost(sources));
  }

  it("detects a direct sensitive access in an API route", () => {
    const entrypoint = "src/app/api/fixture/route.ts";
    const analysis = fixtureAnalysis(entrypoint, {
      [entrypoint]: `
        import { db } from "@/lib/db";
        export async function GET() { return db.party.findMany({}); }
      `,
    });

    expect([...analysis.domains]).toEqual(["Party"]);
  });

  it("detects an aliased Party client binding", () => {
    const entrypoint = "src/app/api/fixture/route.ts";
    const analysis = fixtureAnalysis(entrypoint, {
      [entrypoint]: `
        import { db as prisma } from "@/lib/db";
        export async function GET() { return prisma.party.findMany({}); }
      `,
    });

    expect([...analysis.domains]).toEqual(["Party"]);
  });

  it("detects an aliased FactCheck client binding", () => {
    const entrypoint = "src/app/api/fixture/route.ts";
    const analysis = fixtureAnalysis(entrypoint, {
      [entrypoint]: `
        import { db as client } from "@/lib/db";
        export async function GET() { return client.factCheck.findMany({}); }
      `,
    });

    expect([...analysis.domains]).toEqual(["FactCheck"]);
  });

  it("detects an aliased Affair client binding", () => {
    const entrypoint = "src/app/api/fixture/route.ts";
    const analysis = fixtureAnalysis(entrypoint, {
      [entrypoint]: `
        import { db as database } from "@/lib/db";
        export async function GET() { return database.affair.findMany({}); }
      `,
    });

    expect([...analysis.domains]).toEqual(["Affair"]);
  });

  it("detects literal element access on an aliased Party client", () => {
    const entrypoint = "src/app/api/fixture/route.ts";
    const analysis = fixtureAnalysis(entrypoint, {
      [entrypoint]: `
        import { db as prisma } from "@/lib/db";
        export async function GET() { return prisma["party"].findMany({}); }
      `,
    });

    expect([...analysis.domains]).toEqual(["Party"]);
  });

  it("detects literal element access on an aliased FactCheck client", () => {
    const entrypoint = "src/app/api/fixture/route.ts";
    const analysis = fixtureAnalysis(entrypoint, {
      [entrypoint]: `
        import { db as client } from "@/lib/db";
        export async function GET() { return client["factCheck"].findMany({}); }
      `,
    });

    expect([...analysis.domains]).toEqual(["FactCheck"]);
  });

  it("tracks the runtime binding and ignores the type binding in a mixed import", () => {
    const entrypoint = "src/app/api/fixture/route.ts";
    const analysis = fixtureAnalysis(entrypoint, {
      [entrypoint]: `
        import { db as prisma, type DbTransactionClient } from "@/lib/db";
        const label = "DbTransactionClient";
        export async function GET() { return { label, rows: await prisma.party.findMany({}) }; }
      `,
    });

    expect([...analysis.domains]).toEqual(["Party"]);
  });

  it("ignores type-only import declarations and inline type specifiers", () => {
    const entrypoint = "src/app/api/fixture/route.ts";
    const analysis = fixtureAnalysis(entrypoint, {
      [entrypoint]: `
        import type { DbType } from "@/lib/db";
        import { type DbTransactionClient } from "@/lib/db";
        export async function GET(): Promise<DbType | DbTransactionClient | null> { return null; }
      `,
    });

    expect([...analysis.domains]).toEqual([]);
  });

  it("does not traverse a local module imported exclusively through inline type specifiers", () => {
    const entrypoint = "src/app/api/fixture/route.ts";
    const analysis = fixtureAnalysis(entrypoint, {
      [entrypoint]: `
        import { type SensitiveResult, type SensitiveOptions } from "@/lib/sensitive-types";
        export async function GET(): Promise<SensitiveResult | SensitiveOptions | null> {
          return null;
        }
      `,
      "src/lib/sensitive-types.ts": `
        import { db } from "@/lib/db";
        export type SensitiveResult = Awaited<ReturnType<typeof db.party.findMany>>;
        export type SensitiveOptions = Parameters<typeof db.affair.findMany>[0];
      `,
    });

    expect([...analysis.domains]).toEqual([]);
    expect(analysis.sources.has("src/lib/sensitive-types.ts")).toBe(false);
  });

  it("still traverses a mixed runtime and type import", () => {
    const entrypoint = "src/app/api/fixture/route.ts";
    const analysis = fixtureAnalysis(entrypoint, {
      [entrypoint]: `
        import { loadParties, type SensitiveResult } from "@/lib/sensitive-loader";
        export async function GET(): Promise<SensitiveResult> { return loadParties(); }
      `,
      "src/lib/sensitive-loader.ts": `
        import { db } from "@/lib/db";
        export type SensitiveResult = Awaited<ReturnType<typeof loadParties>>;
        export function loadParties() { return db.party.findMany({}); }
      `,
    });

    expect([...analysis.domains]).toEqual(["Party"]);
    expect(analysis.sources.has("src/lib/sensitive-loader.ts")).toBe(true);
  });

  it("does not traverse exclusively typed local re-exports", () => {
    const entrypoint = "src/app/api/fixture/route.ts";
    const analysis = fixtureAnalysis(entrypoint, {
      [entrypoint]: `
        export type { SensitiveResult } from "@/lib/sensitive-types";
        export { type SensitiveOptions } from "@/lib/sensitive-types";
      `,
      "src/lib/sensitive-types.ts": `
        import { db } from "@/lib/db";
        export type SensitiveResult = Awaited<ReturnType<typeof db.party.findMany>>;
        export type SensitiveOptions = Parameters<typeof db.factCheck.findMany>[0];
      `,
    });

    expect([...analysis.domains]).toEqual([]);
    expect(analysis.sources.has("src/lib/sensitive-types.ts")).toBe(false);
  });

  it("still traverses a mixed runtime and type re-export", () => {
    const entrypoint = "src/app/api/fixture/route.ts";
    const analysis = fixtureAnalysis(entrypoint, {
      [entrypoint]: `
        export { loadAffairs, type SensitiveResult } from "@/lib/sensitive-loader";
      `,
      "src/lib/sensitive-loader.ts": `
        import { db } from "@/lib/db";
        export type SensitiveResult = Awaited<ReturnType<typeof loadAffairs>>;
        export function loadAffairs() { return db.affair.findMany({}); }
      `,
    });

    expect([...analysis.domains]).toEqual(["Affair"]);
    expect(analysis.sources.has("src/lib/sensitive-loader.ts")).toBe(true);
  });

  it("detects a namespace import of the db module", () => {
    const entrypoint = "src/app/api/fixture/route.ts";
    const analysis = fixtureAnalysis(entrypoint, {
      [entrypoint]: `
        import * as database from "@/lib/db";
        export async function GET() { return database.db.party.findMany({}); }
      `,
    });

    expect([...analysis.domains]).toEqual(["Party"]);
  });

  it("does not treat a same-named export from another module as the database binding", () => {
    const entrypoint = "src/app/api/fixture/route.ts";
    const analysis = fixtureAnalysis(entrypoint, {
      [entrypoint]: `
        import { db as prisma } from "@/lib/not-db";
        export async function GET() { return prisma.party.findMany({}); }
      `,
      "src/lib/not-db.ts": "export const db = {};",
    });

    expect([...analysis.domains]).toEqual([]);
  });

  it("tracks direct identifier declarations and assignments", () => {
    const entrypoint = "src/app/api/fixture/route.ts";
    const analysis = fixtureAnalysis(entrypoint, {
      [entrypoint]: `
        import { db } from "@/lib/db";
        const prisma = db;
        let client;
        client = prisma;
        export async function GET() { return client.affair.findMany({}); }
      `,
    });

    expect([...analysis.domains]).toEqual(["Affair"]);
  });

  it("leaves genuinely dynamic model keys outside the bounded analysis", () => {
    const entrypoint = "src/app/api/fixture/route.ts";
    const analysis = fixtureAnalysis(entrypoint, {
      [entrypoint]: `
        import { db as prisma } from "@/lib/db";
        const modelName = "party";
        export async function GET() { return prisma[modelName].findMany({}); }
      `,
    });

    expect([...analysis.domains]).toEqual([]);
  });

  it("ignores sensitive access written only in a comment or string", () => {
    const entrypoint = "src/app/api/fixture/route.ts";
    const analysis = fixtureAnalysis(entrypoint, {
      [entrypoint]: `
        import { db } from "@/lib/db";
        // db.party.findMany({})
        const label = "db.party.findMany({})";
        export async function GET() { return label; }
      `,
    });

    expect([...analysis.domains]).toEqual([]);
  });

  it("ignores type imports, constants and textual model identifiers without access", () => {
    const entrypoint = "src/app/api/fixture/route.ts";
    const analysis = fixtureAnalysis(entrypoint, {
      [entrypoint]: `
        import type { Party } from "@/generated/prisma";
        import { PUBLIC_PARTY_WHERE } from "@/lib/api/public-contract";
        const text = "db.party.findMany Party";
        export async function GET() { return { text, PUBLIC_PARTY_WHERE }; }
      `,
      "src/lib/api/public-contract.ts": "export const PUBLIC_PARTY_WHERE = {};",
    });

    expect([...analysis.domains]).toEqual([]);
  });

  it("detects a route whose only sensitive access is in an imported data module", () => {
    const entrypoint = "src/app/api/fixture/route.ts";
    const analysis = fixtureAnalysis(entrypoint, {
      [entrypoint]: `
        import { loadParties } from "@/lib/data/new-parties";
        export async function GET() { return loadParties(); }
      `,
      "src/lib/data/new-parties.ts": `
        import { db } from "@/lib/db";
        export function loadParties() { return db.party.findMany({}); }
      `,
    });

    expect(analysis.domains.has("Party")).toBe(true);
    expect(analysis.sources.has("src/lib/data/new-parties.ts")).toBe(true);
  });

  it("detects a public page whose sensitive access is imported", () => {
    const entrypoint = "src/app/fixture/page.tsx";
    const analysis = fixtureAnalysis(entrypoint, {
      [entrypoint]: `
        import { loadFactChecks } from "@/lib/data/new-factchecks";
        export default async function Page() { return loadFactChecks(); }
      `,
      "src/lib/data/new-factchecks.ts": `
        import { db } from "@/lib/db";
        export function loadFactChecks() { return db.factCheck.findMany({}); }
      `,
    });

    expect(analysis.domains.has("FactCheck")).toBe(true);
  });

  it("detects an Open Graph image whose sensitive access is imported", () => {
    const entrypoint = "src/app/fixture/opengraph-image.tsx";
    const analysis = fixtureAnalysis(entrypoint, {
      [entrypoint]: `
        import { loadAffair } from "@/lib/data/new-affair";
        export default async function Image() { return loadAffair(); }
      `,
      "src/lib/data/new-affair.ts": `
        import { db } from "@/lib/db";
        export function loadAffair() { return db.affair.findFirst({}); }
      `,
    });

    expect(analysis.domains.has("Affair")).toBe(true);
  });

  it("stops safely when local imports form a cycle", () => {
    const entrypoint = "src/app/api/fixture/route.ts";
    const analysis = fixtureAnalysis(entrypoint, {
      [entrypoint]: `
        import { loadA } from "@/lib/a";
        export async function GET() { return loadA(); }
      `,
      "src/lib/a.ts": `
        import { loadB } from "./b";
        export function loadA() { return loadB(); }
      `,
      "src/lib/b.ts": `
        import { loadA } from "./a";
        import { db } from "@/lib/db";
        export function loadB() { void loadA; return db.party.findMany({}); }
      `,
    });

    expect(analysis.domains.has("Party")).toBe(true);
    expect([...analysis.sources]).toHaveLength(3);
  });

  it("rejects a new sensitive surface missing from the reviewed inventory", () => {
    const entrypoint = "src/app/api/fixture/route.ts";
    const analysis = fixtureAnalysis(entrypoint, {
      [entrypoint]: `
        import { db } from "@/lib/db";
        export async function GET() { return db.party.findMany({}); }
      `,
    });
    const emptyInventory: ReviewedSurfaceInventory = { Party: {}, FactCheck: {}, Affair: {} };

    expect(validateReviewedInventory([analysis], emptyInventory)).toEqual([
      `Party: sensitive surface not reviewed: ${entrypoint}`,
    ]);
  });

  it("rejects affairsAtTime without a public-politician filter", () => {
    const relations = inspectAffairsAtTimeRelations(`
      const query = {
        affairsAtTime: { where: { ...getPublishedAffairWhere() } },
      };
    `);

    expect(relations).toEqual([{ hasPublishedAffairWhere: true, hasPublicPoliticianWhere: false }]);
  });

  it("does not accept a public-politician predicate elsewhere in the function", () => {
    const relations = inspectAffairsAtTimeRelations(`
      const politician = PUBLIC_POLITICIAN_WHERE;
      const query = {
        politicians: { where: PUBLIC_POLITICIAN_WHERE },
        affairsAtTime: { where: { ...getPublishedAffairWhere() } },
      };
      void politician;
    `);

    expect(relations[0]).toEqual({
      hasPublishedAffairWhere: true,
      hasPublicPoliticianWhere: false,
    });
  });

  it("rejects a public-politician predicate nested under NOT", () => {
    const relations = inspectAffairsAtTimeRelations(`
      const query = {
        affairsAtTime: {
          where: {
            ...getPublishedAffairWhere(),
            NOT: { politician: PUBLIC_POLITICIAN_WHERE },
          },
        },
      };
    `);

    expect(relations).toEqual([{ hasPublishedAffairWhere: true, hasPublicPoliticianWhere: false }]);
  });

  it("rejects a public-politician predicate nested under OR", () => {
    const relations = inspectAffairsAtTimeRelations(`
      const query = {
        affairsAtTime: {
          where: {
            ...getPublishedAffairWhere(),
            OR: [{ politician: PUBLIC_POLITICIAN_WHERE }],
          },
        },
      };
    `);

    expect(relations).toEqual([{ hasPublishedAffairWhere: true, hasPublicPoliticianWhere: false }]);
  });

  it("rejects the published-affair helper when it is not a direct where spread", () => {
    const relations = inspectAffairsAtTimeRelations(`
      const published = getPublishedAffairWhere();
      const query = {
        affairsAtTime: {
          where: {
            AND: [{ ...published }],
            politician: PUBLIC_POLITICIAN_WHERE,
          },
        },
      };
    `);

    expect(relations).toEqual([{ hasPublishedAffairWhere: false, hasPublicPoliticianWhere: true }]);
  });

  it("rejects a negative value on the direct politician property", () => {
    const relations = inspectAffairsAtTimeRelations(`
      const query = {
        affairsAtTime: {
          where: {
            ...getPublishedAffairWhere(),
            politician: { NOT: PUBLIC_POLITICIAN_WHERE },
          },
        },
      };
    `);

    expect(relations).toEqual([{ hasPublishedAffairWhere: true, hasPublicPoliticianWhere: false }]);
  });

  it("accepts affairsAtTime only when both canonical predicates share the relation block", () => {
    const relations = inspectAffairsAtTimeRelations(`
      const query = {
        affairsAtTime: {
          where: {
            ...getPublishedAffairWhere(),
            politician: PUBLIC_POLITICIAN_WHERE,
          },
        },
      };
    `);

    expect(relations).toEqual([{ hasPublishedAffairWhere: true, hasPublicPoliticianWhere: true }]);
  });

  it("rejects the guard when only one of two affairsAtTime relations is correct", () => {
    const source = `
      const detail = {
        affairsAtTime: {
          where: {
            ...getPublishedAffairWhere(),
            politician: PUBLIC_POLITICIAN_WHERE,
          },
        },
      };
      const listing = {
        affairsAtTime: {
          where: {
            ...getPublishedAffairWhere(),
            NOT: { politician: PUBLIC_POLITICIAN_WHERE },
          },
        },
      };
    `;
    const relations = inspectAffairsAtTimeRelations(source);

    expect(relations).toHaveLength(2);
    expect(allAffairsAtTimeRelationsArePublic(source, 2)).toBe(false);
  });
});
