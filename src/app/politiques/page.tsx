import { Metadata } from "next";
import { cacheTag, cacheLife } from "next/cache";
import { db } from "@/lib/db";
import { CONVICTION_BADGE_WHERE } from "@/config/labels";
import { type SortOption, type MandateFilter } from "@/components/politicians/FilterBar";
import { MandateType } from "@/generated/prisma";
import { SearchForm } from "@/components/politicians/SearchForm";
import { PoliticiansGrid } from "@/components/politicians/PoliticiansGrid";

import { SeoIntro } from "@/components/seo/SeoIntro";
import { CollectionPageJsonLd } from "@/components/seo/JsonLd";
import { hasActiveListingFilter, listingRobotsMetadata } from "@/lib/seo/listing-robots";
import { POLITIQUES_LISTING_FILTER_KEYS } from "@/lib/seo/listing-filters";
import { SITE_URL } from "@/config/site";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { parsePageParam } from "@/lib/data/query-params";

// Minimum members to show a party in filters (avoid cluttering with old/small parties)
const MIN_PARTY_MEMBERS = 2;

export const revalidate = 300; // 5 minutes — CDN edge cache with ISR

interface PageProps {
  searchParams: Promise<{
    search?: string;
    party?: string;
    conviction?: string;
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
  if (params.sort && params.sort !== "prominence") cp.set("sort", params.sort);
  const qs = cp.toString();

  const hasNonDefaultSort = params.sort !== undefined && params.sort !== "prominence";
  const hasConvictionFilter = params.conviction === "true";
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

// Badge triggers on severity=CRITIQUE (atteintes à la probité)
// Replaced former CONVICTION_STATUSES = ["CONDAMNATION_DEFINITIVE"]

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
  affairs: [{ affairs: { _count: "desc" } }, { lastName: "asc" }],
};

// Shared include block for the listing query
const POLITICIAN_INCLUDE = {
  currentParty: true,
  _count: {
    select: {
      affairs: { where: CONVICTION_BADGE_WHERE },
    },
  },
  affairs: {
    where: CONVICTION_BADGE_WHERE,
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
  mandateFilter?: MandateFilter,
  sortOption: SortOption = "alpha",
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

  if (withConviction) {
    conditions.push({
      affairs: { some: CONVICTION_BADGE_WHERE },
    });
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
  const orderBy = (SORT_CONFIGS[sortOption] || SORT_CONFIGS.alpha) as any;

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
      hasCritiqueAffair: p.affairs.length > 0,
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
  mandateFilter?: MandateFilter,
  sortOption: SortOption = "alpha",
  page = 1
) {
  "use cache";
  cacheTag("politicians");
  cacheLife("synced");
  return queryPoliticians(undefined, partyId, withConviction, mandateFilter, sortOption, page);
}

// Uncached path — free-text search creates unbounded key space
async function searchPoliticians(
  search: string,
  partyId?: string,
  withConviction?: boolean,
  mandateFilter?: MandateFilter,
  sortOption: SortOption = "alpha",
  page = 1
) {
  return queryPoliticians(search, partyId, withConviction, mandateFilter, sortOption, page);
}

// Router: use cached path when no search, uncached when searching
async function getPoliticians(
  search?: string,
  partyId?: string,
  withConviction?: boolean,
  mandateFilter?: MandateFilter,
  sortOption: SortOption = "alpha",
  page = 1
) {
  if (search) {
    return searchPoliticians(search, partyId, withConviction, mandateFilter, sortOption, page);
  }
  return getPoliticiansFiltered(partyId, withConviction, mandateFilter, sortOption, page);
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
  cacheTag("politicians");
  cacheTag("filter-counts");
  cacheLife("synced");

  // Single SQL query replaces 9 parallel Prisma count queries (1 connection instead of 9)
  const [counts] = await db.$queryRaw<
    [
      {
        with_conviction: bigint;
        total_affairs: bigint;
        deputes: bigint;
        senateurs: bigint;
        gouvernement: bigint;
        dirigeants: bigint;
        maires: bigint;
      },
    ]
  >`
    SELECT
      -- Politicians with critique affairs (CONDAMNATION_DEFINITIVE)
      COUNT(DISTINCT p.id) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM "Affair" a
          WHERE a."politicianId" = p.id
            AND a.severity = 'CRITIQUE'
            AND a.status = 'CONDAMNATION_DEFINITIVE'
            AND a."publicationStatus" = 'PUBLISHED'
            AND a.involvement = 'DIRECT'
        )
      ) AS with_conviction,
      -- Total critique affairs
      (SELECT COUNT(*) FROM "Affair"
        WHERE severity = 'CRITIQUE' AND status = 'CONDAMNATION_DEFINITIVE'
          AND "publicationStatus" = 'PUBLISHED' AND involvement = 'DIRECT'
      ) AS total_affairs,
      -- Députés
      COUNT(DISTINCT p.id) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM "Mandate" m
          WHERE m."politicianId" = p.id AND m.type = 'DEPUTE' AND m."isCurrent" = true
        )
      ) AS deputes,
      -- Sénateurs
      COUNT(DISTINCT p.id) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM "Mandate" m
          WHERE m."politicianId" = p.id AND m.type = 'SENATEUR' AND m."isCurrent" = true
        )
      ) AS senateurs,
      -- Gouvernement
      COUNT(DISTINCT p.id) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM "Mandate" m
          WHERE m."politicianId" = p.id
            AND m.type IN ('MINISTRE', 'PREMIER_MINISTRE', 'MINISTRE_DELEGUE', 'SECRETAIRE_ETAT')
            AND m."isCurrent" = true
        )
      ) AS gouvernement,
      -- Dirigeants (PRESIDENT_PARTI + significant party roles)
      COUNT(DISTINCT p.id) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM "Mandate" m
          WHERE m."politicianId" = p.id AND m.type = 'PRESIDENT_PARTI' AND m."isCurrent" = true
        )
        OR EXISTS (
          SELECT 1 FROM "PartyMembership" pm
          WHERE pm."politicianId" = p.id AND pm."endDate" IS NULL AND pm.role != 'MEMBRE'
        )
      ) AS dirigeants,
      -- Maires
      COUNT(DISTINCT p.id) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM "Mandate" m
          WHERE m."politicianId" = p.id AND m.type = 'MAIRE' AND m."isCurrent" = true
        )
      ) AS maires
    FROM "Politician" p
    WHERE p."publicationStatus" = 'PUBLISHED'
  `;

  return {
    withConviction: Number(counts.with_conviction),
    totalAffairs: Number(counts.total_affairs),
    deputes: Number(counts.deputes),
    senateurs: Number(counts.senateurs),
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
  const rawMandate = params.mandate || "";
  const mandateFilter = (
    rawMandate === "president_parti" ? "dirigeants" : rawMandate
  ) as MandateFilter;
  // Normalised, not cast: an unknown ?sort= (a bookmark on the retired
  // "dissidence" sort, say) would otherwise reach the <select> as a value with
  // no matching option, showing an empty sort box over an alphabetically
  // sorted list, and get echoed back into every filter link the grid builds.
  const rawSort = params.sort ?? "";
  const sortOption: SortOption = rawSort in SORT_CONFIGS ? (rawSort as SortOption) : "prominence";
  const page = parsePageParam(params.page);

  const [{ politicians, total, totalPages }, parties, counts] = await Promise.all([
    getPoliticians(search, partyFilter, convictionFilter, mandateFilter, sortOption, page),
    getParties(),
    getFilterCounts(),
  ]);

  // Count active filters
  const activeFilterCount = [partyFilter, convictionFilter, mandateFilter].filter(Boolean).length;

  return (
    <>
      <CollectionPageJsonLd
        name="Représentants politiques français"
        description="Liste des représentants politiques français : députés, sénateurs, ministres et dirigeants de partis."
        url={`${SITE_URL}/politiques`}
        numberOfItems={total}
      />
      <div className="container mx-auto px-4 pt-4 pb-8">
        <Breadcrumb items={[{ label: "Politiques" }]} />
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-extrabold tracking-tight mb-1">
              Représentants politiques
            </h1>
            <p className="text-sm text-muted-foreground">
              {total} représentants
              {search && ` pour "${search}"`}
              {activeFilterCount > 0 &&
                ` (${activeFilterCount} filtre${activeFilterCount > 1 ? "s" : ""} actif${activeFilterCount > 1 ? "s" : ""})`}
            </p>
            <div className="sr-only">
              <SeoIntro
                text={`Poligraph référence ${total.toLocaleString("fr-FR")} responsables politiques français : députés, sénateurs, membres du gouvernement et dirigeants de partis. Données issues de sources officielles.`}
              />
            </div>
          </div>
        </div>

        {/* Search with autocomplete */}
        <div className="mb-6">
          <SearchForm
            defaultSearch={search}
            partyFilter={partyFilter}
            convictionFilter={convictionFilter}
            mandateFilter={mandateFilter}
            sortOption={sortOption}
          />
        </div>

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
            mandateFilter,
            sortOption,
          }}
          showMissingDeclarationBadge
        />
      </div>
    </>
  );
}
