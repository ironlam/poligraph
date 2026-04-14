import { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { DEPARTMENTS, getDepartmentSlug } from "@/config/departments";
import { getAllThemeSlugs } from "@/lib/theme-utils";
import { SITE_URL } from "@/config/site";

export async function generateSitemaps() {
  return [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
}

export default async function sitemap(props: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
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

// Sitemap 0: Static pages + PUBLISHED politicians (priority 0.8-1.0)
async function buildStaticAndPoliticiansSitemap(): Promise<MetadataRoute.Sitemap> {
  const politicians = await db.politician.findMany({
    where: { publicationStatus: "PUBLISHED" },
    select: { slug: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

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

  return [...staticPages, ...politicianPages];
}

// Sitemap 1: Affairs + parties + elections + departments (priority 0.6-0.7)
async function buildAffairsPartiesElectionsDepartmentsSitemap(): Promise<MetadataRoute.Sitemap> {
  const lastAffairUpdate = await db.affair.findFirst({
    where: {
      publicationStatus: "PUBLISHED",
      status: {
        in: ["CONDAMNATION_DEFINITIVE", "CONDAMNATION_PREMIERE_INSTANCE", "APPEL_EN_COURS"],
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

// Sitemap 3: Top 500 scrutins by recency (priority 0.4)
async function buildScrutinsSitemap(): Promise<MetadataRoute.Sitemap> {
  const scrutins = await db.scrutin.findMany({
    where: { slug: { not: null } },
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

// Sitemap 4: Top 500 communes by population (priority 0.6)
async function buildCommunesSitemap(): Promise<MetadataRoute.Sitemap> {
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
