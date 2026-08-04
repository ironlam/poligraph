import { MetadataRoute } from "next";
import { cacheTag, cacheLife } from "next/cache";
import { connection } from "next/server";
import { Prisma } from "@/generated/prisma";
import { SITEMAP_SHARD_TAGS } from "@/lib/seo/sitemap-tags";
import { db } from "@/lib/db";
import { DEPARTMENTS, getDepartmentSlug } from "@/config/departments";
import { getAllThemeSlugs } from "@/lib/theme-utils";
import { SITE_URL } from "@/config/site";
import { getWeekStart, getISOWeekString } from "@/lib/data/recap";
import {
  SIGNIFICANT_MANDATE_TYPES,
  MAIRE_MIN_COMMUNE_POPULATION,
  MIN_BIOGRAPHY_LENGTH,
} from "@/lib/seo/politician-robots";

export async function generateSitemaps() {
  return [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
}

export default async function sitemap(props: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  // Render the envelope per request. Measured in production: the shards were
  // served as static artefacts (`accept-ranges: bytes`, no `x-nextjs-prerender`,
  // query string ignored in the cache key), so tag invalidation never reached
  // them and a depublished affair stayed announced — as did the absence of a
  // newly published one. The data itself stays cached and tagged in the
  // builders below, so this costs a serialisation, not a query (#572).
  await connection();

  const id = Number(await props.id);
  switch (id) {
    case 0:
      return buildStaticAndPoliticiansSitemap();
    case 1:
      return buildAffairsPartiesElectionsDepartmentsSitemap();
    case 2:
      return buildDossiersSitemap();
    case 3:
      return buildScrutinsSitemap();
    case 4:
      return buildCommunesSitemap();
    default:
      return [];
  }
}

// Sitemap 0: Static pages + rich PUBLISHED politicians (priority 0.8-1.0).
// Bare profiles (RNE-imported mayors: no significant mandate, no affair, no
// fact-check, no declaration, no bio) are excluded to fight index bloat
// (issue #385). This SQL mirrors isIndexablePolitician() from
// src/lib/seo/politician-robots.ts — keep both in sync.
async function buildStaticAndPoliticiansSitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheTag(...SITEMAP_SHARD_TAGS[0]);
  cacheLife("synced");

  const politicians = await db.$queryRaw<Array<{ slug: string; updatedAt: Date }>>(Prisma.sql`
    SELECT p."slug", p."updatedAt"
    FROM "Politician" p
    WHERE p."publicationStatus" = 'PUBLISHED'
      AND (
        EXISTS (
          SELECT 1 FROM "Mandate" m
          WHERE m."politicianId" = p."id"
            AND m."type"::text IN (${Prisma.join([...SIGNIFICANT_MANDATE_TYPES])})
        )
        OR EXISTS (
          -- LEFT JOINs: a MAIRE mandate without commune link (or without
          -- population) is fail-open, like isIndexablePolitician().
          SELECT 1 FROM "Mandate" m
          LEFT JOIN "MandateLocal" ml ON ml."mandateId" = m."id"
          LEFT JOIN "Commune" c ON c."id" = ml."communeId"
          WHERE m."politicianId" = p."id"
            AND m."type" = 'MAIRE'
            AND (c."population" IS NULL OR c."population" >= ${MAIRE_MIN_COMMUNE_POPULATION})
        )
        OR EXISTS (
          SELECT 1 FROM "Affair" a
          WHERE a."politicianId" = p."id" AND a."publicationStatus" = 'PUBLISHED'
        )
        OR EXISTS (
          SELECT 1 FROM "FactCheckMention" f WHERE f."politicianId" = p."id"
        )
        OR EXISTS (
          SELECT 1 FROM "Declaration" d WHERE d."politicianId" = p."id"
        )
        OR (p."biography" IS NOT NULL
            AND length(btrim(p."biography", E' \t\n\r')) >= ${MIN_BIOGRAPHY_LENGTH})
      )
    ORDER BY p."updatedAt" DESC
  `);

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/politiques`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/partis`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/affaires`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/parlement`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/parlement/dossiers`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/mon-depute`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/departements`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/statistiques`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/elections`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/factchecks`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/presse`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/carte`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/declarations-et-patrimoine`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/comparer`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/institutions`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/institutions/assemblee-nationale`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/sources`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/methodologie`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/soutenir`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/mentions-legales`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/elections/municipales-2026`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/elections/municipales-2026/carte`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/elections/municipales-2026/parite`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/elections/municipales-2026/cumul`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/elections/municipales-2026/maires`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
  ];

  const politicianPages: MetadataRoute.Sitemap = politicians.map((p) => ({
    url: `${SITE_URL}/politiques/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  // Last 52 completed ISO weeks of /recap/[week] archives
  const recapPages: MetadataRoute.Sitemap = [];
  const now = new Date();
  for (let i = 1; i <= 52; i++) {
    const monday = getWeekStart(new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000));
    const iso = getISOWeekString(monday);
    recapPages.push({
      url: `${SITE_URL}/recap/${iso}`,
      lastModified: monday,
      changeFrequency: "never" as const,
      priority: i <= 4 ? 0.7 : 0.5,
    });
  }

  return [...staticPages, ...recapPages, ...politicianPages];
}

// Sitemap 1: Affairs + parties + elections + departments (priority 0.6-0.7)
async function buildAffairsPartiesElectionsDepartmentsSitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheTag(...SITEMAP_SHARD_TAGS[1]);
  cacheLife("synced");

  const lastAffairUpdate = await db.affair.findFirst({
    where: {
      publicationStatus: "PUBLISHED",
      status: {
        in: [
          "CONDAMNATION_DEFINITIVE",
          "CONDAMNATION_PREMIERE_INSTANCE",
          "APPEL_EN_COURS",
          "POURVOI_EN_CASSATION",
        ],
      },
    },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });
  const condamnationsLastmod = lastAffairUpdate?.updatedAt ?? new Date();

  const condamnationsEntries: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/affaires/condamnations`,
      lastModified: condamnationsLastmod,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/affaires/condamnations?mandat=depute`,
      lastModified: condamnationsLastmod,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/affaires/condamnations?mandat=senateur`,
      lastModified: condamnationsLastmod,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/affaires/condamnations?mandat=gouvernement`,
      lastModified: condamnationsLastmod,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/affaires/condamnations?mandat=locaux`,
      lastModified: condamnationsLastmod,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/affaires/condamnations?certainty=etabli`,
      lastModified: condamnationsLastmod,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/affaires/condamnations?view=stats`,
      lastModified: condamnationsLastmod,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    },
  ];

  const [affairs, parties, partiesWithAffairs, elections] = await Promise.all([
    db.affair.findMany({
      where: { publicationStatus: "PUBLISHED" },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    db.party.findMany({
      where: { politicians: { some: {} } },
      select: { slug: true, updatedAt: true },
    }),
    db.party.findMany({
      where: {
        slug: { not: null },
        affairsAtTime: { some: { publicationStatus: "PUBLISHED" } },
      },
      select: { slug: true, updatedAt: true },
    }),
    db.election.findMany({
      select: { slug: true, updatedAt: true },
      orderBy: { round1Date: "desc" },
    }),
  ]);

  const affairPages: MetadataRoute.Sitemap = affairs.map((a) => ({
    url: `${SITE_URL}/affaires/${a.slug}`,
    lastModified: a.updatedAt,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  const partyPages: MetadataRoute.Sitemap = parties
    .filter((p) => p.slug)
    .map((p) => ({
      url: `${SITE_URL}/partis/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));

  const partyAffairPages: MetadataRoute.Sitemap = partiesWithAffairs
    .filter((p) => p.slug)
    .map((p) => ({
      url: `${SITE_URL}/affaires/parti/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

  const electionPages: MetadataRoute.Sitemap = elections.map((e) => ({
    url: `${SITE_URL}/elections/${e.slug}`,
    lastModified: e.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  const departmentPages: MetadataRoute.Sitemap = Object.values(DEPARTMENTS).map((dept) => ({
    url: `${SITE_URL}/departements/${getDepartmentSlug(dept.name)}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  const themePages: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/parlement/votes/themes`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    ...getAllThemeSlugs().map((slug) => ({
      url: `${SITE_URL}/parlement/votes/themes/${slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];

  return [
    ...condamnationsEntries,
    ...affairPages,
    ...partyPages,
    ...partyAffairPages,
    ...electionPages,
    ...departmentPages,
    ...themePages,
  ];
}

// Sitemap 2: Legislative dossiers — top 300 most recent (priority 0.6)
async function buildDossiersSitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheTag(...SITEMAP_SHARD_TAGS[2]);
  cacheLife("synced");

  const dossiers = await db.legislativeDossier.findMany({
    where: { slug: { not: null } },
    select: { slug: true, updatedAt: true },
    orderBy: { filingDate: "desc" },
    take: 300,
  });

  return dossiers
    .filter((d) => d.slug)
    .map((d) => ({
      url: `${SITE_URL}/parlement/dossiers/${d.slug}`,
      lastModified: d.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
}

// Sitemap 3: Top 500 indexable scrutins by recency (priority 0.4).
// Bare amendment scrutins (no approved policy title, no summary, no citizen impact, not
// a key vote, or no ballot recorded) are excluded: they are noindex,follow on the page
// itself, so announcing them here only spends crawl budget to reach a noindex. This
// `where` mirrors isIndexableScrutin() from src/lib/seo/scrutin-robots.ts — keep both
// in sync (guarded by src/lib/seo/__tests__/indexation-doctrine.test.ts).
async function buildScrutinsSitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheTag(...SITEMAP_SHARD_TAGS[3]);
  cacheLife("synced");

  const scrutins = await db.scrutin.findMany({
    where: {
      slug: { not: null },
      OR: [
        { importance: { isKeyVote: true } },
        { policyTitle: { status: "APPROVED" } },
        // Paired conditions, not a bare `not: null`: isIndexableScrutin() treats an
        // empty string as no summary, and Prisma's `not` on a nullable column keeps
        // NULL rows, so each side has to be stated.
        { AND: [{ summary: { not: null } }, { summary: { not: "" } }] },
        { AND: [{ citizenImpact: { not: null } }, { citizenImpact: { not: "" } }] },
      ],
      NOT: { votesFor: 0, votesAgainst: 0, votesAbstain: 0 },
    },
    select: { slug: true, updatedAt: true },
    orderBy: { votingDate: "desc" },
    take: 500,
  });

  return scrutins
    .filter((s) => s.slug)
    .map((s) => ({
      url: `${SITE_URL}/parlement/votes/${s.slug}`,
      lastModified: s.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.4,
    }));
}

// Sitemap 4: Top 200 communes by population, restricted to those with candidacies (priority 0.6)
async function buildCommunesSitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheTag(...SITEMAP_SHARD_TAGS[4]);
  cacheLife("synced");

  const communes: Array<{ id: string }> = await db.$queryRaw`
    SELECT DISTINCT c.id, c.population
    FROM "Commune" c
    INNER JOIN "Candidacy" ca ON ca."communeId" = c.id
    ORDER BY c.population DESC NULLS LAST
    LIMIT 200
  `;

  return communes.map((c) => ({
    url: `${SITE_URL}/elections/municipales-2026/communes/${c.id}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));
}
