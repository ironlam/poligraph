import { cacheTag, cacheLife } from "next/cache";
import { db } from "@/lib/db";
import {
  getCategoriesForSuper,
  CATEGORY_TO_SUPER,
  type AffairSuperCategory,
} from "@/config/labels";
import {
  getCertaintyLevel,
  getStatusesForCertainty,
  type CertaintyLevel,
} from "@/config/certainty";
import type { AffairStatus, AffairCategory, AffairSeverity, Involvement } from "@/types";
import {
  AffairStatus as AffairStatusEnum,
  AffairCategory as AffairCategoryEnum,
} from "@/generated/prisma";
import { pickEnumValue } from "@/lib/data/enum-guards";
import { PUBLIC_PARTY_WHERE, PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";
import { getPublishedAffairWhere } from "@/lib/affairs/public-filters";

export async function getPartiesWithAffairs() {
  "use cache";
  cacheTag("affairs", "parties");
  cacheLife("synced");

  const publicAffairWhere = {
    ...getPublishedAffairWhere(),
    politician: PUBLIC_POLITICIAN_WHERE,
  };
  const parties = await db.party.findMany({
    where: {
      ...PUBLIC_PARTY_WHERE,
      affairsAtTime: {
        some: publicAffairWhere,
      },
      slug: { not: null },
    },
    select: {
      slug: true,
      shortName: true,
      name: true,
      color: true,
      _count: {
        select: { affairsAtTime: { where: publicAffairWhere } },
      },
    },
    orderBy: { shortName: "asc" },
  });

  return parties;
}

export async function getPublicPartyMetadataBySlug(slug: string) {
  return db.party.findFirst({
    where: { slug, ...PUBLIC_PARTY_WHERE },
    select: { name: true, shortName: true },
  });
}

interface AffairFilterOpts {
  search?: string;
  status?: string;
  superCategory?: AffairSuperCategory;
  category?: string;
  severity?: AffairSeverity;
  involvements: Involvement[];
  partySlug?: string;
  certainty?: CertaintyLevel;
}

// Single source of truth for the listing WHERE clause, shared by the paginated
// query and the neighbour query so "affaire précédente / suivante" matches the
// exact perimeter the reader was browsing.
function buildAffairWhere(opts: AffairFilterOpts) {
  const { search, status, superCategory, category, severity, involvements, partySlug, certainty } =
    opts;

  // Build category filter based on super-category or specific category
  // Whitelist guard: `category` and `status` arrive raw from the query string.
  const safeCategory = pickEnumValue(category, AffairCategoryEnum);
  let categoryFilter: AffairCategory[] | undefined;
  if (safeCategory) {
    categoryFilter = [safeCategory];
  } else if (superCategory) {
    categoryFilter = getCategoriesForSuper(superCategory);
  }

  // In victim mode, restrict to violence-related categories
  if (involvements.includes("VICTIM")) {
    categoryFilter = categoryFilter
      ? categoryFilter.filter((c) => VIOLENCE_CATEGORIES.includes(c))
      : VIOLENCE_CATEGORIES;
  }

  // Build status filter: certainty takes precedence over individual status
  let statusFilter: { status: AffairStatus } | { status: { in: AffairStatus[] } } | undefined;
  if (certainty) {
    statusFilter = { status: { in: getStatusesForCertainty(certainty) } };
  } else {
    const safeStatus = pickEnumValue(status, AffairStatusEnum);
    if (safeStatus) statusFilter = { status: safeStatus };
  }

  return {
    ...getPublishedAffairWhere(),
    involvement: { in: involvements },
    ...statusFilter,
    ...(categoryFilter && { category: { in: categoryFilter } }),
    ...(severity && { severity }),
    ...(partySlug && { partyAtTime: { slug: partySlug, ...PUBLIC_PARTY_WHERE } }),
    ...(search && {
      OR: [
        { title: { contains: search, mode: "insensitive" as const } },
        { description: { contains: search, mode: "insensitive" as const } },
      ],
    }),
    politician: PUBLIC_POLITICIAN_WHERE,
  };
}

// Tier 1: Core query — accepts free-text search (never cached directly)
async function queryAffairs(
  search?: string,
  status?: string,
  superCategory?: AffairSuperCategory,
  category?: string,
  severity?: AffairSeverity,
  page = 1,
  involvements: Involvement[] = ["DIRECT"],
  partySlug?: string,
  sort?: string,
  certainty?: CertaintyLevel
) {
  const limit = 20;
  const skip = (page - 1) * limit;

  const where = buildAffairWhere({
    search,
    status,
    superCategory,
    category,
    severity,
    involvements,
    partySlug,
    certainty,
  });

  const orderBy = buildOrderBy(sort);

  const [affairs, total] = await Promise.all([
    db.affair.findMany({
      where,
      include: {
        politician: {
          select: { id: true, fullName: true, slug: true, currentParty: true },
        },
        partyAtTime: {
          select: {
            id: true,
            slug: true,
            shortName: true,
            name: true,
            color: true,
            _count: { select: { politicians: { where: PUBLIC_POLITICIAN_WHERE } } },
          },
        },
        sources: { select: { id: true }, take: 1 },
        _count: { select: { sources: true } },
      },
      orderBy,
      skip,
      take: limit,
    }),
    db.affair.count({ where }),
  ]);

  return {
    affairs: affairs.map((a) => {
      const partyAtTime =
        a.partyAtTime && a.partyAtTime._count.politicians > 0
          ? {
              id: a.partyAtTime.id,
              slug: a.partyAtTime.slug,
              shortName: a.partyAtTime.shortName,
              name: a.partyAtTime.name,
              color: a.partyAtTime.color,
            }
          : null;
      return {
        ...a,
        partyAtTime,
        fineAmount: a.fineAmount ? Number(a.fineAmount) : null,
      };
    }),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

function buildOrderBy(sort?: string) {
  switch (sort) {
    case "date-desc":
      return [
        { verdictDate: { sort: "desc" as const, nulls: "last" as const } },
        { startDate: { sort: "desc" as const, nulls: "last" as const } },
        { createdAt: "desc" as const },
      ];
    case "date-asc":
      return [
        { verdictDate: { sort: "asc" as const, nulls: "last" as const } },
        { startDate: { sort: "asc" as const, nulls: "last" as const } },
        { createdAt: "asc" as const },
      ];
    case "name-asc":
      return [{ politician: { lastName: "asc" as const } }, { createdAt: "desc" as const }];
    case "name-desc":
      return [{ politician: { lastName: "desc" as const } }, { createdAt: "desc" as const }];
    case "certainty":
      // Severity correlates with certainty: CRITIQUE affairs (probity) tend to have
      // definitive condemnations, SIGNIFICATIF tend to be ongoing/minor.
      // Perfect certainty sort would need raw SQL CASE; severity ASC is a practical proxy.
      return [
        { severity: "asc" as const },
        { verdictDate: { sort: "desc" as const, nulls: "last" as const } },
        { startDate: { sort: "desc" as const, nulls: "last" as const } },
        { createdAt: "desc" as const },
      ];
    default:
      return [
        { verdictDate: { sort: "desc" as const, nulls: "last" as const } },
        { startDate: { sort: "desc" as const, nulls: "last" as const } },
        { createdAt: "desc" as const },
      ];
  }
}

// Tier 2: Cached path — bounded params only (no free-text search)
export async function getAffairsFiltered(
  status?: string,
  superCategory?: AffairSuperCategory,
  category?: string,
  severity?: AffairSeverity,
  page = 1,
  involvements: Involvement[] = ["DIRECT"],
  partySlug?: string,
  sort?: string,
  certainty?: CertaintyLevel
) {
  "use cache";
  cacheTag("affairs");
  cacheLife("synced");
  return queryAffairs(
    undefined,
    status,
    superCategory,
    category,
    severity,
    page,
    involvements,
    partySlug,
    sort,
    certainty
  );
}

// Tier 3: Uncached path — free-text search
export async function searchAffairs(
  search: string,
  status?: string,
  superCategory?: AffairSuperCategory,
  category?: string,
  severity?: AffairSeverity,
  page = 1,
  involvements: Involvement[] = ["DIRECT"],
  partySlug?: string,
  sort?: string,
  certainty?: CertaintyLevel
) {
  return queryAffairs(
    search,
    status,
    superCategory,
    category,
    severity,
    page,
    involvements,
    partySlug,
    sort,
    certainty
  );
}

// Router — decides cached vs uncached
export async function getAffairs(
  search?: string,
  status?: string,
  superCategory?: AffairSuperCategory,
  category?: string,
  severity?: AffairSeverity,
  page = 1,
  involvements: Involvement[] = ["DIRECT"],
  partySlug?: string,
  sort?: string,
  certainty?: CertaintyLevel
) {
  if (search) {
    return searchAffairs(
      search,
      status,
      superCategory,
      category,
      severity,
      page,
      involvements,
      partySlug,
      sort,
      certainty
    );
  }
  return getAffairsFiltered(
    status,
    superCategory,
    category,
    severity,
    page,
    involvements,
    partySlug,
    sort,
    certainty
  );
}

/**
 * Ordered slug+title list for a filter perimeter, no pagination, used by the
 * neighbour API to resolve prev/next. Bounded (the full published set is small)
 * and select-only, so an unpaginated scan is cheap. Same WHERE + ORDER BY as the
 * listing, so the order matches what the reader was browsing.
 */
export async function getAffairNeighborsList(
  opts: AffairFilterOpts & { sort?: string }
): Promise<Array<{ slug: string; title: string }>> {
  const where = buildAffairWhere(opts);
  const orderBy = buildOrderBy(opts.sort);
  const rows = await db.affair.findMany({ where, orderBy, select: { slug: true, title: true } });
  return rows.flatMap((r) => (r.slug ? [{ slug: r.slug, title: r.title }] : []));
}

export async function getSuperCategoryCounts() {
  "use cache";
  cacheTag("affairs");
  cacheLife("synced");

  const categoryCounts = await db.affair.groupBy({
    by: ["category"],
    where: {
      ...getPublishedAffairWhere(),
      politician: PUBLIC_POLITICIAN_WHERE,
      involvement: "DIRECT",
    },
    _count: { category: true },
  });

  // Aggregate by super-category
  const superCounts: Record<string, number> = {
    PROBITE: 0,
    FINANCES: 0,
    PERSONNES: 0,
    EXPRESSION: 0,
    AUTRE: 0,
  };

  for (const { category, _count } of categoryCounts) {
    const superCat = CATEGORY_TO_SUPER[category as AffairCategory];
    if (superCat) {
      superCounts[superCat]! += _count.category;
    }
  }

  return superCounts;
}

export async function getStatusCounts() {
  "use cache";
  cacheTag("affairs");
  cacheLife("synced");

  const statusCounts = await db.affair.groupBy({
    by: ["status"],
    where: {
      ...getPublishedAffairWhere(),
      politician: PUBLIC_POLITICIAN_WHERE,
      involvement: "DIRECT",
    },
    _count: { status: true },
  });

  return Object.fromEntries(statusCounts.map((s) => [s.status, s._count.status]));
}

export async function getSeverityCounts() {
  "use cache";
  cacheTag("affairs");
  cacheLife("synced");

  const severityCounts = await db.affair.groupBy({
    by: ["severity"],
    where: {
      ...getPublishedAffairWhere(),
      politician: PUBLIC_POLITICIAN_WHERE,
      involvement: "DIRECT",
    },
    _count: { severity: true },
  });

  return Object.fromEntries(severityCounts.map((s) => [s.severity, s._count.severity])) as Record<
    string,
    number
  >;
}

export async function getCertaintyCounts() {
  "use cache";
  cacheTag("affairs");
  cacheLife("synced");

  const statusCounts = await db.affair.groupBy({
    by: ["status"],
    _count: true,
    where: {
      ...getPublishedAffairWhere(),
      politician: PUBLIC_POLITICIAN_WHERE,
      involvement: { notIn: ["VICTIM", "PLAINTIFF", "MENTIONED_ONLY"] },
    },
  });

  const counts: Record<CertaintyLevel, number> = {
    ETABLI: 0,
    PRONONCE: 0,
    EN_COURS: 0,
    CLOS_SANS_CHARGE: 0,
    CLOS_FAVORABLE: 0,
  };

  for (const row of statusCounts) {
    const level = getCertaintyLevel(row.status);
    counts[level] += row._count;
  }

  return counts;
}

const TERMINAL_STATUSES: AffairStatus[] = [
  "RELAXE",
  "ACQUITTEMENT",
  "NON_LIEU",
  "PRESCRIPTION",
  "CLASSEMENT_SANS_SUITE",
  "CONDAMNATION_DEFINITIVE",
  "INSTRUCTION_CLOTUREE_SANS_MISE_EN_EXAMEN",
];

const VICTIM_INVOLVEMENTS: Involvement[] = ["VICTIM", "PLAINTIFF"];
const VIOLENCE_CATEGORIES: AffairCategory[] = [
  "MENACE",
  "VIOLENCE",
  "HARCELEMENT_MORAL",
  "HARCELEMENT_SEXUEL",
  "AGRESSION_SEXUELLE",
];

export async function getVictimStats() {
  "use cache";
  cacheTag("affairs");
  cacheLife("synced");

  const victimWhere = {
    ...getPublishedAffairWhere(),
    politician: PUBLIC_POLITICIAN_WHERE,
    involvement: { in: VICTIM_INVOLVEMENTS },
    category: { in: VIOLENCE_CATEGORIES },
  };

  const [totalAffairs, politicianIds, ongoingProcedures] = await Promise.all([
    db.affair.count({ where: victimWhere }),
    db.affair.findMany({
      where: victimWhere,
      select: { politicianId: true },
      distinct: ["politicianId"],
    }),
    db.affair.count({
      where: {
        ...victimWhere,
        status: { notIn: TERMINAL_STATUSES },
      },
    }),
  ]);

  return {
    totalAffairs,
    totalPoliticians: politicianIds.length,
    ongoingProcedures,
  };
}
