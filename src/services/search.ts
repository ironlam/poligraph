import { db } from "@/lib/db";
import { Prisma, MandateType } from "@/generated/prisma";
import { findDepartmentCode } from "@/config/departments";
import { getPublishedAffairWhere } from "@/lib/affairs/public-filters";

// FTS result type from raw query
interface FTSResult {
  id: string;
  slug: string;
  fullName: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  currentPartyId: string | null;
  relevance: number;
}

export interface SearchFilters {
  query: string;
  partyId?: string;
  mandateType?: MandateType;
  department?: string;
  hasAffairs?: boolean;
  isActive?: boolean;
}

export interface SearchResult {
  id: string;
  slug: string;
  fullName: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  currentParty: {
    id: string;
    name: string;
    shortName: string;
    color: string | null;
  } | null;
  currentMandate: {
    type: MandateType;
    constituency: string | null;
  } | null;
  /** Legacy compatibility total: published affairs across every involvement role. */
  affairsCount: number;
  relevance?: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  totalPages: number;
  suggestions?: string[];
}

/**
 * Search using PostgreSQL Full-Text Search.
 * The public search boundary is enforced in SQL before any IDs leave this query.
 */
async function searchWithFTS(
  filters: SearchFilters,
  page: number,
  limit: number
): Promise<SearchResponse> {
  const { query, partyId, mandateType, department, hasAffairs, isActive } = filters;
  const skip = (page - 1) * limit;

  const ftsResults = await db.$queryRaw<FTSResult[]>`
    SELECT
      p.id,
      p.slug,
      p."fullName",
      p."firstName",
      p."lastName",
      p."photoUrl",
      p."currentPartyId",
      ts_rank(p."searchVector", plainto_tsquery('french', unaccent(${query}))) as relevance
    FROM "Politician" p
    WHERE p."publicationStatus" = 'PUBLISHED'
      AND (
        p."searchVector" @@ plainto_tsquery('french', unaccent(${query}))
        OR p."fullName" ILIKE ${`%${query}%`}
        OR p."lastName" ILIKE ${`%${query}%`}
      )
    ORDER BY relevance DESC, p."lastName" ASC
    LIMIT 500
  `;

  if (ftsResults.length === 0) {
    const suggestions = await generateSuggestions(query);
    return {
      results: [],
      total: 0,
      page,
      totalPages: 0,
      suggestions,
    };
  }

  let matchingIds = ftsResults.map((r) => r.id);

  if (partyId || mandateType || department || hasAffairs !== undefined || isActive !== undefined) {
    const additionalFilters: Prisma.PoliticianWhereInput[] = [
      { id: { in: matchingIds }, publicationStatus: "PUBLISHED" },
    ];

    if (partyId) {
      additionalFilters.push({ currentPartyId: partyId });
    }

    if (mandateType) {
      additionalFilters.push({
        mandates: { some: { type: mandateType, isCurrent: true } },
      });
    }

    if (department) {
      const deptCode = findDepartmentCode(department);
      if (deptCode) {
        additionalFilters.push({
          mandates: { some: { departmentCode: deptCode, isCurrent: true } },
        });
      }
    }

    if (hasAffairs === true) {
      additionalFilters.push({
        affairs: { some: getPublishedAffairWhere() },
      });
    } else if (hasAffairs === false) {
      additionalFilters.push({
        affairs: { none: getPublishedAffairWhere() },
      });
    }

    if (isActive === true) {
      additionalFilters.push({ mandates: { some: { isCurrent: true } } });
    } else if (isActive === false) {
      additionalFilters.push({ mandates: { none: { isCurrent: true } } });
    }

    const filteredPoliticians = await db.politician.findMany({
      where: { AND: additionalFilters },
      select: { id: true },
    });

    matchingIds = filteredPoliticians.map((p) => p.id);
  }

  const total = matchingIds.length;

  const orderedIds = ftsResults
    .filter((r) => matchingIds.includes(r.id))
    .slice(skip, skip + limit)
    .map((r) => r.id);

  const politicians = await db.politician.findMany({
    where: { id: { in: orderedIds }, publicationStatus: "PUBLISHED" },
    select: {
      id: true,
      slug: true,
      fullName: true,
      firstName: true,
      lastName: true,
      photoUrl: true,
      currentParty: {
        select: { id: true, name: true, shortName: true, color: true },
      },
      mandates: {
        where: { isCurrent: true },
        select: { type: true, constituency: true },
        take: 1,
      },
      _count: {
        select: { affairs: { where: getPublishedAffairWhere() } },
      },
    },
  });

  const politicianMap = new Map(politicians.map((p) => [p.id, p]));
  const orderedPoliticians = orderedIds
    .map((id) => politicianMap.get(id))
    .filter(Boolean) as typeof politicians;

  const results: SearchResult[] = orderedPoliticians.map((p) => ({
    id: p.id,
    slug: p.slug,
    fullName: p.fullName,
    firstName: p.firstName,
    lastName: p.lastName,
    photoUrl: p.photoUrl,
    currentParty: p.currentParty,
    currentMandate: p.mandates[0] || null,
    affairsCount: p._count.affairs,
  }));

  return {
    results,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Advanced public search using PostgreSQL full-text search for text queries,
 * combined with Prisma for other filters.
 */
export async function searchPoliticians(
  filters: SearchFilters,
  page: number = 1,
  limit: number = 20
): Promise<SearchResponse> {
  const { query, partyId, mandateType, department, hasAffairs, isActive } = filters;
  const skip = (page - 1) * limit;

  if (query && query.length >= 2) {
    return searchWithFTS(filters, page, limit);
  }

  const whereConditions: Prisma.PoliticianWhereInput[] = [{ publicationStatus: "PUBLISHED" }];

  if (partyId) {
    whereConditions.push({ currentPartyId: partyId });
  }

  if (mandateType) {
    whereConditions.push({
      mandates: {
        some: {
          type: mandateType,
          isCurrent: true,
        },
      },
    });
  }

  if (department) {
    const deptCode = findDepartmentCode(department);
    if (deptCode) {
      whereConditions.push({
        mandates: { some: { departmentCode: deptCode, isCurrent: true } },
      });
    }
  }

  if (hasAffairs === true) {
    whereConditions.push({
      affairs: { some: getPublishedAffairWhere() },
    });
  } else if (hasAffairs === false) {
    whereConditions.push({
      affairs: { none: getPublishedAffairWhere() },
    });
  }

  if (isActive === true) {
    whereConditions.push({
      mandates: { some: { isCurrent: true } },
    });
  } else if (isActive === false) {
    whereConditions.push({
      mandates: { none: { isCurrent: true } },
    });
  }

  const where: Prisma.PoliticianWhereInput = { AND: whereConditions };

  const [politicians, total] = await Promise.all([
    db.politician.findMany({
      where,
      select: {
        id: true,
        slug: true,
        fullName: true,
        firstName: true,
        lastName: true,
        photoUrl: true,
        currentParty: {
          select: {
            id: true,
            name: true,
            shortName: true,
            color: true,
          },
        },
        mandates: {
          where: { isCurrent: true },
          select: {
            type: true,
            constituency: true,
          },
          take: 1,
        },
        _count: {
          select: { affairs: { where: getPublishedAffairWhere() } },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip,
      take: limit,
    }),
    db.politician.count({ where }),
  ]);

  const results: SearchResult[] = politicians.map((p) => ({
    id: p.id,
    slug: p.slug,
    fullName: p.fullName,
    firstName: p.firstName,
    lastName: p.lastName,
    photoUrl: p.photoUrl,
    currentParty: p.currentParty,
    currentMandate: p.mandates[0] || null,
    affairsCount: p._count.affairs,
  }));

  let suggestions: string[] | undefined;
  if (results.length === 0 && query && query.length >= 2) {
    suggestions = await generateSuggestions(query);
  }

  return {
    results,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    suggestions,
  };
}

async function generateSuggestions(query: string): Promise<string[]> {
  const partialMatches = await db.politician.findMany({
    where: {
      publicationStatus: "PUBLISHED",
      OR: [
        { lastName: { startsWith: query.slice(0, 3), mode: "insensitive" } },
        { firstName: { startsWith: query.slice(0, 3), mode: "insensitive" } },
      ],
    },
    select: { fullName: true },
    take: 5,
    distinct: ["fullName"],
  });

  return partialMatches.map((p) => p.fullName);
}

export async function getAutocompleteSuggestions(
  query: string,
  limit: number = 8
): Promise<SearchResult[]> {
  if (query.length < 2) {
    return [];
  }

  const ftsResults = await db.$queryRaw<FTSResult[]>`
    SELECT
      p.id,
      p.slug,
      p."fullName",
      p."firstName",
      p."lastName",
      p."photoUrl",
      p."currentPartyId",
      ts_rank(p."searchVector", plainto_tsquery('french', unaccent(${query}))) as relevance
    FROM "Politician" p
    WHERE p."publicationStatus" = 'PUBLISHED'
      AND (
        p."searchVector" @@ plainto_tsquery('french', unaccent(${query}))
        OR p."fullName" ILIKE ${`%${query}%`}
        OR p."lastName" ILIKE ${`%${query}%`}
      )
    ORDER BY relevance DESC, p."lastName" ASC
    LIMIT ${limit}
  `;

  if (ftsResults.length === 0) {
    return [];
  }

  const ids = ftsResults.map((r) => r.id);
  const politicians = await db.politician.findMany({
    where: { id: { in: ids }, publicationStatus: "PUBLISHED" },
    select: {
      id: true,
      slug: true,
      fullName: true,
      firstName: true,
      lastName: true,
      photoUrl: true,
      currentParty: {
        select: { id: true, name: true, shortName: true, color: true },
      },
      mandates: {
        where: { isCurrent: true },
        select: { type: true, constituency: true },
        take: 1,
      },
      _count: {
        select: { affairs: { where: getPublishedAffairWhere() } },
      },
    },
  });

  const politicianMap = new Map(politicians.map((p) => [p.id, p]));
  return ids
    .map((id) => politicianMap.get(id))
    .filter(Boolean)
    .map((p) => ({
      id: p!.id,
      slug: p!.slug,
      fullName: p!.fullName,
      firstName: p!.firstName,
      lastName: p!.lastName,
      photoUrl: p!.photoUrl,
      currentParty: p!.currentParty,
      currentMandate: p!.mandates[0] || null,
      affairsCount: p!._count.affairs,
    }));
}

/**
 * Get public search filter options (for dropdowns).
 */
export async function getSearchFilterOptions() {
  const [parties, departments, mandateTypes] = await Promise.all([
    db.$queryRaw<
      Array<{
        id: string;
        shortName: string;
        name: string;
        color: string | null;
        count: bigint;
      }>
    >`
      SELECT party.id,
             party."shortName",
             party.name,
             party.color,
             COUNT(member.id) AS count
      FROM "Party" party
      JOIN "Politician" member
        ON member."currentPartyId" = party.id
       AND member."publicationStatus" = 'PUBLISHED'
      WHERE EXISTS (
        SELECT 1
        FROM "Politician" active_member
        JOIN "Mandate" mandate
          ON mandate."politicianId" = active_member.id
        WHERE active_member."currentPartyId" = party.id
          AND active_member."publicationStatus" = 'PUBLISHED'
          AND mandate."isCurrent" = true
      )
      GROUP BY party.id, party."shortName", party.name, party.color
      ORDER BY COUNT(member.id) DESC, party.name ASC
      LIMIT 50
    `,

    db.mandate.findMany({
      where: {
        isCurrent: true,
        constituency: { not: null },
        type: "DEPUTE",
        politician: { publicationStatus: "PUBLISHED" },
      },
      select: { constituency: true },
      distinct: ["constituency"],
    }),

    db.$queryRaw<Array<{ type: MandateType; count: bigint }>>`
      SELECT m.type, COUNT(DISTINCT m."politicianId") as count
      FROM "Mandate" m
      JOIN "Politician" p ON p.id = m."politicianId"
      WHERE m."isCurrent" = true
        AND p."publicationStatus" = 'PUBLISHED'
      GROUP BY m.type
      ORDER BY count DESC
    `,
  ]);

  const uniqueDepartments = [
    ...new Set(departments.map((d) => d.constituency?.split("(")[0]!.trim()).filter(Boolean)),
  ].sort();

  return {
    parties: parties.map((p) => ({
      id: p.id,
      shortName: p.shortName,
      name: p.name,
      color: p.color,
      count: Number(p.count),
    })),
    departments: uniqueDepartments,
    mandateTypes: mandateTypes.map((m) => ({
      type: m.type,
      count: Number(m.count),
    })),
  };
}
