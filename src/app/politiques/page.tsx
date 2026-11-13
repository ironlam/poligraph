import { Metadata } from "next";
import Link from "next/link";
import { Briefcase, Building2, Globe, Landmark, MapPin } from "lucide-react";
import { cacheTag, cacheLife } from "next/cache";
import { db } from "@/lib/db";
import {
  getPoliticalFinancingBadgeSql,
  getPoliticalFinancingBadgeWhere,
  getProbityConvictionBadgeSql,
  getProbityConvictionBadgeWhere,
} from "@/lib/affairs/public-filters";
import { type MandateFilter } from "@/components/politicians/FilterBar";
import {
  DEFAULT_POLITIQUES_SORT,
  parsePolitiquesSort,
  politiquesSortParam,
  type SortOption,
} from "@/config/politiques-sort";
import { MandateType, type Prisma } from "@/generated/prisma";
import { SearchForm } from "@/components/politicians/SearchForm";
import { PoliticiansGrid } from "@/components/politicians/PoliticiansGrid";

import { SeoIntro } from "@/components/seo/SeoIntro";
import { CollectionPageJsonLd } from "@/components/seo/JsonLd";
import { hasActiveListingFilter, listingRobotsMetadata } from "@/lib/seo/listing-robots";
import { POLITIQUES_LISTING_FILTER_KEYS } from "@/lib/seo/listing-filters";
import { SITE_URL } from "@/config/site";
import { BandeauSurtitre, RubriqueBandeau } from "@/components/ui/RubriqueBandeau";
import { HemicycleDecor } from "@/components/ui/HemicycleDecor";
import { RubriqueEntrees, type RubriqueEntree } from "@/components/ui/RubriqueEntrees";
import { SurChaqueFiche } from "@/components/politicians/SurChaqueFiche";
import { parsePageParam } from "@/lib/data/query-params";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { PolitiquesLocalNav } from "@/components/governments/PolitiquesLocalNav";

// Minimum members to show a party in filters (avoid cluttering with old/small parties)
const MIN_PARTY_MEMBERS = 2;

export const revalidate = 300; // 5 minutes — CDN edge cache with ISR

interface PageProps {
  searchParams: Promise<{
    search?: string;
    party?: string;
    conviction?: string;
    financing?: string;
    mandate?: string;
    status?: string;
    sort?: string;
    page?: string;
  }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const cp = new URLSearchParams();
  if (params.mandate) cp.set("mandate", params.mandate);
  if (params.party) cp.set("party", params.party);
  if (params.conviction === "true") cp.set("conviction", "true");
  if (params.financing === "true") cp.set("financing", "true");
  const sortParam = politiquesSortParam(params.sort);
  if (sortParam) cp.set("sort", sortParam);
  const qs = cp.toString();

  const hasNonDefaultSort = params.sort !== undefined && params.sort !== DEFAULT_POLITIQUES_SORT;
  const hasConvictionFilter = params.conviction === "true" || params.financing === "true";
  const noindex =
    hasActiveListingFilter(params, POLITIQUES_LISTING_FILTER_KEYS) ||
    hasConvictionFilter ||
    hasNonDefaultSort;

  return {
    title: "Représentants politiques",
    description: "Liste des représentants politiques français - députés, sénateurs, ministres",
    ...listingRobotsMetadata(noindex),
    alternates: { canonical: `/politiques${qs ? `?${qs}` : ""}` },
  };
}

// Badge probité : condamnation définitive dans une catégorie de probité (pas la gravité)

// Mandate type groups
const MANDATE_GROUPS: Record<string, MandateType[]> = {
  depute: ["DEPUTE"],
  senateur: ["SENATEUR"],
  gouvernement: ["MINISTRE", "PREMIER_MINISTRE", "MINISTRE_DELEGUE", "SECRETAIRE_ETAT"],
  dirigeants: ["PRESIDENT_PARTI"], // Also includes significant party roles (handled separately)
  maire: ["MAIRE"],
  depute_europeen: ["DEPUTE_EUROPEEN"],
};

// Sort configurations - using 'any' to handle complex Prisma orderBy types
const SORT_CONFIGS: Record<SortOption, unknown> = {
  prominence: [{ prominenceScore: "desc" }, { lastName: "asc" }],
  alpha: { lastName: "asc" },
  "alpha-desc": { lastName: "desc" },
  recent: { createdAt: "desc" },
};

// Shared include block for the listing query
const POLITICIAN_INCLUDE = {
  currentParty: true,
  _count: {
    select: {
      affairs: { where: getProbityConvictionBadgeWhere() },
    },
  },
  // Le badge probité se lit sur _count ; cette relation porte le badge financement politique.
  affairs: {
    where: getPoliticalFinancingBadgeWhere(),
    select: { id: true },
    take: 1,
  },
  mandates: {
    where: { isCurrent: true },
    orderBy: { startDate: "desc" as const },
    take: 1,
    select: {
      type: true,
      title: true,
      constituency: true,
    },
  },
  declarations: {
    where: { type: "INTERETS" as const },
    select: { id: true },
    take: 1,
  },
  partyHistory: {
    where: {
      endDate: null,
      role: { not: "MEMBRE" as const },
    },
    take: 1,
    include: {
      party: {
        select: { name: true, shortName: true },
      },
    },
  },
} as const;

// Core query logic shared by cached and uncached paths
async function queryPoliticians(
  search?: string,
  partyId?: string,
  withConviction?: boolean,
  withFinancing?: boolean,
  mandateFilter?: MandateFilter,
  sortOption: SortOption = DEFAULT_POLITIQUES_SORT,
  page = 1
) {
  const limit = 24;
  const skip = (page - 1) * limit;

  // Build where clause using AND array for composability
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conditions: any[] = [];

  // Only show PUBLISHED politicians by default
  conditions.push({ publicationStatus: "PUBLISHED" as const });

  if (search) {
    conditions.push({
      OR: [
        { fullName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { firstName: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  if (partyId) {
    conditions.push({ currentPartyId: partyId });
  }

  // Probité et financement politique se cumulent en « l'un ou l'autre ».
  const convictionConditions: Prisma.PoliticianWhereInput[] = [];
  if (withConviction) {
    convictionConditions.push({ affairs: { some: getProbityConvictionBadgeWhere() } });
  }
  if (withFinancing) {
    convictionConditions.push({ affairs: { some: getPoliticalFinancingBadgeWhere() } });
  }
  if (convictionConditions.length > 0) {
    conditions.push({ OR: convictionConditions });
  }

  // Build mandate filter conditions
  // Note: mandate filter implies isCurrent: true (filtering by current role)
  // Status filter: active = has any current mandate OR significant party role
  if (mandateFilter === "dirigeants") {
    // Filter: party presidents + significant party roles
    conditions.push({
      OR: [
        { mandates: { some: { type: "PRESIDENT_PARTI", isCurrent: true } } },
        { partyHistory: { some: { endDate: null, role: { not: "MEMBRE" } } } },
      ],
    });
  } else if (mandateFilter && MANDATE_GROUPS[mandateFilter]) {
    // Filter by specific mandate type (always current)
    conditions.push({
      mandates: {
        some: {
          type: { in: MANDATE_GROUPS[mandateFilter] },
          isCurrent: true,
        },
      },
    });
  }

  const where = conditions.length > 0 ? { AND: conditions } : {};

  // Get order by config
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderBy = (SORT_CONFIGS[sortOption] || SORT_CONFIGS[DEFAULT_POLITIQUES_SORT]) as any;

  const [politicians, total] = await Promise.all([
    db.politician.findMany({
      where,
      include: POLITICIAN_INCLUDE,
      orderBy,
      skip,
      take: limit,
    }),
    db.politician.count({ where }),
  ]);

  // Transform to add hasConviction flag, current mandate, and significant party role
  const politiciansWithConviction = politicians.map((p) => {
    const significantRole = p.partyHistory[0] || null;
    const mandate = p.mandates[0] || null;
    const isActiveParliamentarian =
      mandate !== null && (mandate.type === "DEPUTE" || mandate.type === "SENATEUR");
    const hasDeclaration = p.declarations.length > 0;
    return {
      ...p,
      hasCritiqueAffair: p._count.affairs > 0,
      hasPoliticalFinancingConviction: p.affairs.length > 0,
      affairs: undefined,
      currentMandate: mandate,
      mandates: undefined,
      declarations: undefined,
      partyHistory: undefined,
      missingDeclaration: isActiveParliamentarian && !hasDeclaration,
      significantPartyRole: significantRole
        ? {
            role: significantRole.role,
            partyName: significantRole.party.name,
            partyShortName: significantRole.party.shortName,
          }
        : null,
    };
  });

  return {
    politicians: politiciansWithConviction,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

// Cached path — bounded key space (enums + page, no free-text search)
async function getPoliticiansFiltered(
  partyId?: string,
  withConviction?: boolean,
  withFinancing?: boolean,
  mandateFilter?: MandateFilter,
  sortOption: SortOption = DEFAULT_POLITIQUES_SORT,
  page = 1
) {
  "use cache";
  // "affairs" : les badges et filtres de condamnation dépendent du statut et de la catégorie.
  cacheTag("politicians", "affairs");
  cacheLife("synced");
  return queryPoliticians(
    undefined,
    partyId,
    withConviction,
    withFinancing,
    mandateFilter,
    sortOption,
    page
  );
}

// Uncached path — free-text search creates unbounded key space
async function searchPoliticians(
  search: string,
  partyId?: string,
  withConviction?: boolean,
  withFinancing?: boolean,
  mandateFilter?: MandateFilter,
  sortOption: SortOption = DEFAULT_POLITIQUES_SORT,
  page = 1
) {
  return queryPoliticians(
    search,
    partyId,
    withConviction,
    withFinancing,
    mandateFilter,
    sortOption,
    page
  );
}

// Router: use cached path when no search, uncached when searching
async function getPoliticians(
  search?: string,
  partyId?: string,
  withConviction?: boolean,
  withFinancing?: boolean,
  mandateFilter?: MandateFilter,
  sortOption: SortOption = DEFAULT_POLITIQUES_SORT,
  page = 1
) {
  if (search) {
    return searchPoliticians(
      search,
      partyId,
      withConviction,
      withFinancing,
      mandateFilter,
      sortOption,
      page
    );
  }
  return getPoliticiansFiltered(
    partyId,
    withConviction,
    withFinancing,
    mandateFilter,
    sortOption,
    page
  );
}

async function getParties() {
  "use cache";
  cacheTag("politicians", "parties");
  cacheLife("synced");

  const parties = await db.party.findMany({
    where: {
      politicians: { some: {} }, // Only parties with members
    },
    orderBy: [{ politicians: { _count: "desc" } }, { name: "asc" }],
    include: {
      _count: { select: { politicians: true } },
    },
  });

  // Filter out parties with too few members (old/merged parties)
  return parties.filter((p) => p._count.politicians >= MIN_PARTY_MEMBERS);
}

async function getFilterCounts() {
  "use cache";
  cacheTag("politicians", "affairs");
  cacheTag("filter-counts");
  cacheLife("synced");

  // One round trip, and every count starts from the small side: the current mandates, the affairs,
  // the party roles. The earlier form probed nine EXISTS per published politician; with 36 650
  // profiles (mostly mayors) that was a million buffer reads and about a second, which kept coming
  // back in Sentry as a slow query on /politiques. Same results, about 100 ms (EXPLAIN ANALYZE in
  // production, 2026-11-13). A count is over published politicians only, hence the joins.
  const [counts] = await db.$queryRaw<
    [
      {
        total: bigint;
        with_conviction: bigint;
        with_financing: bigint;
        deputes: bigint;
        senateurs: bigint;
        eurodeputes: bigint;
        gouvernement: bigint;
        dirigeants: bigint;
        maires: bigint;
      },
    ]
  >`
    SELECT
      (SELECT COUNT(*) FROM "Politician" p WHERE p."publicationStatus" = 'PUBLISHED') AS total,
      (
        SELECT COUNT(DISTINCT a."politicianId") FROM "Affair" a
        JOIN "Politician" p ON p.id = a."politicianId"
        WHERE p."publicationStatus" = 'PUBLISHED' AND ${getProbityConvictionBadgeSql("a")}
      ) AS with_conviction,
      (
        SELECT COUNT(DISTINCT a."politicianId") FROM "Affair" a
        JOIN "Politician" p ON p.id = a."politicianId"
        WHERE p."publicationStatus" = 'PUBLISHED' AND ${getPoliticalFinancingBadgeSql("a")}
      ) AS with_financing,
      cm.deputes, cm.senateurs, cm.eurodeputes, cm.gouvernement,
      (
        SELECT COUNT(*) FROM (
          SELECT m."politicianId" FROM "Mandate" m
          WHERE m.type = 'PRESIDENT_PARTI' AND m."isCurrent" = true
          UNION
          SELECT pm."politicianId" FROM "PartyMembership" pm
          WHERE pm."endDate" IS NULL AND pm.role != 'MEMBRE'
        ) leaders
        JOIN "Politician" p ON p.id = leaders."politicianId"
        WHERE p."publicationStatus" = 'PUBLISHED'
      ) AS dirigeants,
      cm.maires
    FROM (
      SELECT
        COUNT(DISTINCT m."politicianId") FILTER (WHERE m.type = 'DEPUTE') AS deputes,
        COUNT(DISTINCT m."politicianId") FILTER (WHERE m.type = 'SENATEUR') AS senateurs,
        COUNT(DISTINCT m."politicianId") FILTER (WHERE m.type = 'DEPUTE_EUROPEEN') AS eurodeputes,
        COUNT(DISTINCT m."politicianId") FILTER (
          WHERE m.type IN ('MINISTRE', 'PREMIER_MINISTRE', 'MINISTRE_DELEGUE', 'SECRETAIRE_ETAT')
        ) AS gouvernement,
        COUNT(DISTINCT m."politicianId") FILTER (WHERE m.type = 'MAIRE') AS maires
      FROM "Mandate" m
      JOIN "Politician" p ON p.id = m."politicianId"
      WHERE m."isCurrent" = true AND p."publicationStatus" = 'PUBLISHED'
    ) cm
  `;

  return {
    total: Number(counts.total),
    withConviction: Number(counts.with_conviction),
    withFinancing: Number(counts.with_financing),
    deputes: Number(counts.deputes),
    senateurs: Number(counts.senateurs),
    eurodeputes: Number(counts.eurodeputes),
    gouvernement: Number(counts.gouvernement),
    dirigeants: Number(counts.dirigeants),
    maires: Number(counts.maires),
  };
}

export default async function PolitiquesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = params.search || "";
  const partyFilter = params.party || "";
  const convictionFilter = params.conviction === "true";
  const financingFilter = params.financing === "true";
  const rawMandate = params.mandate || "";
  const mandateFilter = (
    rawMandate === "president_parti" ? "dirigeants" : rawMandate
  ) as MandateFilter;
  // Normalised, not cast: an unknown ?sort= (a bookmark on the retired
  // "dissidence" sort, say) would otherwise reach the <select> as a value with
  // no matching option, showing an empty sort box over an alphabetically
  // sorted list, and get echoed back into every filter link the grid builds.
  const sortOption = parsePolitiquesSort(params.sort);
  const page = parsePageParam(params.page);

  const [
    { politicians, total, totalPages },
    parties,
    counts,
    governmentsEnabled,
    monDeputeEnabled,
  ] = await Promise.all([
    getPoliticians(
      search,
      partyFilter,
      convictionFilter,
      financingFilter,
      mandateFilter,
      sortOption,
      page
    ),
    getParties(),
    getFilterCounts(),
    isFeatureEnabled("gouvernements"),
    isFeatureEnabled("MON_DEPUTE_SECTION"),
  ]);

  // Count active filters
  const activeFilterCount = [partyFilter, convictionFilter, financingFilter, mandateFilter].filter(
    Boolean
  ).length;
  // Bare landing: the banner and entry tiles only show without search, filter, sort or page.
  const isLanding =
    !search && activeFilterCount === 0 && sortOption === DEFAULT_POLITIQUES_SORT && page === 1;

  const entrees: RubriqueEntree[] = [
    {
      href: "/politiques?mandate=depute",
      title: "Députés",
      icon: Landmark,
      detail: `${counts.deputes.toLocaleString("fr-FR")} en exercice`,
    },
    {
      href: "/politiques?mandate=senateur",
      title: "Sénateurs",
      icon: Building2,
      detail: `${counts.senateurs.toLocaleString("fr-FR")} en exercice`,
    },
    {
      href: "/politiques?mandate=depute_europeen",
      title: "Eurodéputés",
      icon: Globe,
      detail: `${counts.eurodeputes.toLocaleString("fr-FR")} en exercice`,
    },
    {
      href: "/politiques?mandate=maire",
      title: "Maires",
      icon: MapPin,
      detail: `${counts.maires.toLocaleString("fr-FR")} en exercice`,
    },
  ];
  if (governmentsEnabled) {
    entrees.push({
      href: "/politiques/gouvernements",
      title: "Gouvernement",
      icon: Briefcase,
      detail: "Ministres et compositions successives",
    });
  }

  const searchForm = (tone: "marine" | "clair") => (
    <SearchForm
      defaultSearch={search}
      partyFilter={partyFilter}
      convictionFilter={convictionFilter}
      financingFilter={financingFilter}
      mandateFilter={mandateFilter}
      sortOption={sortOption}
      tone={tone}
    />
  );
  const seoIntro = (
    <div className="sr-only">
      <SeoIntro
        text={`Poligraph référence ${total.toLocaleString("fr-FR")} responsables politiques français : députés, sénateurs, membres du gouvernement et dirigeants de partis. Données issues de sources officielles.`}
      />
    </div>
  );

  return (
    <>
      <CollectionPageJsonLd
        name="Représentants politiques français"
        description="Liste des représentants politiques français : députés, sénateurs, ministres et dirigeants de partis."
        url={`${SITE_URL}/politiques`}
        numberOfItems={total}
      />
      {governmentsEnabled && <PolitiquesLocalNav current="personnes" />}
      {isLanding && (
        <RubriqueBandeau labelledBy="politiques-titre">
          <div className="flex items-center gap-10">
            <div className="min-w-0 max-w-3xl flex-1">
              <BandeauSurtitre>Politiques</BandeauSurtitre>
              <h1
                id="politiques-titre"
                className="font-display text-2xl font-extrabold leading-tight tracking-tight sm:mt-4 sm:text-5xl"
              >
                Représentants politiques
              </h1>
              <p className="mt-4 max-w-2xl text-base text-white/85 max-sm:sr-only sm:text-lg">
                Mandats, votes, déclarations d{"'"}intérêts et affaires judiciaires. Chaque
                information renvoie à sa source.
              </p>
              <div className="mt-3 max-w-xl sm:mt-6">{searchForm("marine")}</div>
              <p className="mt-3 text-sm text-white/85 sm:mt-4">
                <strong className="font-bold text-white">
                  {counts.total.toLocaleString("fr-FR")}
                </strong>{" "}
                représentants référencés
              </p>
              {monDeputeEnabled && (
                <Link
                  href="/mon-depute"
                  prefetch={false}
                  className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-white underline sm:mt-2 underline-offset-4 hover:no-underline"
                >
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                  Trouver mon député par code postal
                </Link>
              )}
              {seoIntro}
            </div>
            <HemicycleDecor className="hidden w-[420px] shrink-0 lg:block" />
          </div>
        </RubriqueBandeau>
      )}
      <div className="container mx-auto px-4 pt-4 pb-8">
        {isLanding ? (
          <div className="mb-4 space-y-4 sm:mt-4 sm:mb-8 sm:space-y-8">
            <RubriqueEntrees
              titre="Explorer par mandat"
              titreId="explorer-par-mandat"
              entrees={entrees}
            />
            {/* From sm up only: on a phone it stood between the entries and the list. */}
            <div className="hidden sm:block">
              <SurChaqueFiche />
            </div>
            <div>
              <h2 className="font-display text-lg font-extrabold text-primary sm:text-2xl">
                Tous les représentants
              </h2>
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                Toute personne mise en cause dans une procédure judiciaire est présumée innocente
                jusqu{"'"}à ce qu{"'"}elle ait été déclarée coupable par une décision de justice
                définitive.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-3xl font-display font-extrabold tracking-tight mb-1">
                Représentants politiques
              </h1>
              <p className="text-sm text-muted-foreground">
                {total} représentants
                {search && ` pour "${search}"`}
                {activeFilterCount > 0 &&
                  ` (${activeFilterCount} filtre${activeFilterCount > 1 ? "s" : ""} actif${activeFilterCount > 1 ? "s" : ""})`}
              </p>
              {seoIntro}
            </div>
            <div className="mb-6">{searchForm("clair")}</div>
          </>
        )}

        {governmentsEnabled && mandateFilter === "gouvernement" && (
          <p className="mb-6 text-sm text-muted-foreground">
            Ce filtre porte sur les fonctions en cours. Pour l&apos;historique, consultez les{" "}
            <Link
              href="/politiques/gouvernements"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              gouvernements
            </Link>
            .
          </p>
        )}

        {/* Filters, grid, and pagination with loading states */}
        <PoliticiansGrid
          politicians={politicians}
          total={total}
          page={page}
          totalPages={totalPages}
          parties={parties}
          counts={counts}
          filters={{
            search,
            partyFilter,
            convictionFilter,
            financingFilter,
            mandateFilter,
            sortOption,
          }}
          showMissingDeclarationBadge
        />
      </div>
    </>
  );
}
