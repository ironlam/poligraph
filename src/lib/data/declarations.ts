import { cacheTag, cacheLife } from "next/cache";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma";
import type { DeclarationSortOption } from "@/components/declarations/DeclarationsFilterBar";
import type { DeclarationDetails } from "@/types/hatvp";

const PAGE_SIZE = 24;

export interface DeclarationRow {
  id: string;
  slug: string;
  firstName: string;
  lastName: string;
  fullName: string;
  photoUrl: string | null;
  blobPhotoUrl: string | null;
  party: { id: string; name: string; shortName: string | null; color: string | null } | null;
  totalPortfolioValue: number | null;
  totalCompanies: number;
  latestAnnualIncome: number | null;
  totalDirectorships: number;
  declarationCount: number;
  latestYear: number | null;
  hasDetails: boolean;
}

/**
 * Fetch aggregated stats — cached
 */
export async function getDeclarationStats() {
  "use cache";
  cacheTag("declarations");
  cacheLife("synced");

  const [totalDeclarations, politiciansWithDeclarations] = await Promise.all([
    db.declaration.count(),
    db.politician.count({
      where: { declarations: { some: {} }, publicationStatus: "PUBLISHED" },
    }),
  ]);

  // Get all enriched declarations to compute aggregate portfolio
  const enriched = await db.declaration.findMany({
    where: { details: { not: Prisma.DbNull } },
    select: { details: true, politicianId: true },
  });

  // Group by politician, take max portfolio per politician
  const byPolitician = new Map<string, number>();
  for (const decl of enriched) {
    const details = decl.details as unknown as DeclarationDetails;
    const value = details?.totalPortfolioValue ?? 0;
    const current = byPolitician.get(decl.politicianId) ?? 0;
    if (value > current) byPolitician.set(decl.politicianId, value);
  }

  const totalPortfolio = Array.from(byPolitician.values()).reduce((a, b) => a + b, 0);

  return {
    totalDeclarations,
    politiciansWithDeclarations,
    enrichedCount: enriched.length,
    totalPortfolio,
  };
}

/**
 * Top politicians by portfolio value — cached
 */
export async function getTopPortfolios(limit = 10) {
  "use cache";
  cacheTag("declarations");
  cacheLife("synced");

  const politicians = await db.politician.findMany({
    where: {
      publicationStatus: "PUBLISHED",
      declarations: { some: { details: { not: Prisma.DbNull } } },
    },
    include: {
      currentParty: { select: { id: true, name: true, shortName: true, color: true } },
      declarations: {
        where: { details: { not: Prisma.DbNull } },
        orderBy: { year: "desc" },
        take: 1,
        select: { details: true, year: true },
      },
    },
  });

  const rows = politicians
    .map((p) => {
      const details = p.declarations[0]?.details as unknown as DeclarationDetails | null;
      return {
        id: p.id,
        slug: p.slug,
        firstName: p.firstName,
        lastName: p.lastName,
        fullName: p.fullName,
        photoUrl: p.photoUrl,
        blobPhotoUrl: p.blobPhotoUrl,
        party: p.currentParty,
        totalPortfolioValue: details?.totalPortfolioValue ?? 0,
        totalCompanies: details?.totalCompanies ?? 0,
        year: p.declarations[0]?.year,
      };
    })
    .filter((r) => r.totalPortfolioValue > 0)
    .sort((a, b) => b.totalPortfolioValue - a.totalPortfolioValue)
    .slice(0, limit);

  return rows;
}

/**
 * Most commonly held companies by politicians — cached
 */
export async function getTopCompanies(limit = 10) {
  "use cache";
  cacheTag("declarations");
  cacheLife("synced");

  const declarations = await db.declaration.findMany({
    where: { details: { not: Prisma.DbNull } },
    select: { details: true, politicianId: true },
  });

  const companyMap = new Map<string, { politicians: Set<string>; totalValue: number }>();

  for (const decl of declarations) {
    const details = decl.details as unknown as DeclarationDetails;
    if (!details?.financialParticipations) continue;

    for (const part of details.financialParticipations) {
      if (!part.company) continue;
      // Skip redacted company names (e.g. "SCI [Données non publiées]")
      if (part.company.includes("[Données non publiées]")) continue;
      const key = part.company.toUpperCase().trim();
      if (!companyMap.has(key)) {
        companyMap.set(key, { politicians: new Set(), totalValue: 0 });
      }
      const entry = companyMap.get(key)!;
      entry.politicians.add(decl.politicianId);
      if (part.evaluation) entry.totalValue += part.evaluation;
    }
  }

  return Array.from(companyMap.entries())
    .map(([name, data]) => ({
      company: name,
      politicianCount: data.politicians.size,
      totalValue: data.totalValue,
    }))
    .filter((c) => c.politicianCount >= 2) // Only companies held by 2+ politicians
    .sort((a, b) => b.politicianCount - a.politicianCount || b.totalValue - a.totalValue)
    .slice(0, limit);
}

/**
 * Core query for the declarations listing
 */
async function queryDeclarationsList(
  search?: string,
  partyId?: string,
  sortOption: DeclarationSortOption = "portfolio",
  page = 1
): Promise<{ rows: DeclarationRow[]; total: number; page: number; totalPages: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conditions: any[] = [
    { publicationStatus: "PUBLISHED" as const },
    { declarations: { some: {} } },
  ];

  if (search) {
    conditions.push({
      OR: [
        { fullName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  if (partyId) {
    conditions.push({ currentPartyId: partyId });
  }

  const where = { AND: conditions };

  const politicians = await db.politician.findMany({
    where,
    take: 2000,
    include: {
      currentParty: { select: { id: true, name: true, shortName: true, color: true } },
      declarations: {
        orderBy: { year: "desc" },
        select: { type: true, year: true, details: true },
      },
    },
  });

  // Extract summary from latest enriched DIA
  const rows: DeclarationRow[] = politicians.map((p) => {
    const latestDIA = p.declarations.find((d) => d.details !== null);
    const details = latestDIA?.details as unknown as DeclarationDetails | null;

    return {
      id: p.id,
      slug: p.slug,
      firstName: p.firstName,
      lastName: p.lastName,
      fullName: p.fullName,
      photoUrl: p.photoUrl,
      blobPhotoUrl: p.blobPhotoUrl,
      party: p.currentParty,
      totalPortfolioValue: details?.totalPortfolioValue ?? null,
      totalCompanies: details?.totalCompanies ?? 0,
      latestAnnualIncome: details?.latestAnnualIncome ?? null,
      totalDirectorships: details?.totalDirectorships ?? 0,
      declarationCount: p.declarations.length,
      latestYear: p.declarations[0]?.year ?? null,
      hasDetails: details !== null,
    };
  });

  // Sort
  switch (sortOption) {
    case "portfolio":
      rows.sort((a, b) => (b.totalPortfolioValue ?? -1) - (a.totalPortfolioValue ?? -1));
      break;
    case "income":
      rows.sort((a, b) => (b.latestAnnualIncome ?? -1) - (a.latestAnnualIncome ?? -1));
      break;
    case "companies":
      rows.sort((a, b) => b.totalCompanies - a.totalCompanies);
      break;
    case "alpha":
      rows.sort((a, b) => a.lastName.localeCompare(b.lastName, "fr"));
      break;
    case "recent":
      rows.sort((a, b) => (b.latestYear ?? 0) - (a.latestYear ?? 0));
      break;
  }

  const total = rows.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const paginatedRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return { rows: paginatedRows, total, page, totalPages };
}

/**
 * Cached path — bounded params (no free-text search)
 */
async function getDeclarationsFiltered(
  partyId?: string,
  sortOption: DeclarationSortOption = "portfolio",
  page = 1
) {
  "use cache";
  cacheTag("declarations");
  cacheLife("synced");
  return queryDeclarationsList(undefined, partyId, sortOption, page);
}

/**
 * Uncached path — free-text search (unbounded key space)
 */
async function searchDeclarations(
  search: string,
  partyId?: string,
  sortOption: DeclarationSortOption = "portfolio",
  page = 1
) {
  return queryDeclarationsList(search, partyId, sortOption, page);
}

/**
 * Router: cached when no search, uncached when searching
 */
export async function getDeclarations(
  search?: string,
  partyId?: string,
  sortOption: DeclarationSortOption = "portfolio",
  page = 1
) {
  if (search) return searchDeclarations(search, partyId, sortOption, page);
  return getDeclarationsFiltered(partyId, sortOption, page);
}

/**
 * Parties with at least one member who has declarations
 */
export async function getParties() {
  "use cache";
  cacheTag("declarations", "parties");
  cacheLife("synced");

  return db.party.findMany({
    where: {
      politicians: {
        some: {
          declarations: { some: {} },
          publicationStatus: "PUBLISHED",
        },
      },
    },
    select: { id: true, name: true, shortName: true, color: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Party declaration rates for active parliamentarians — cached
 */
export async function getPartyTransparency() {
  "use cache";
  cacheTag("declarations", "parties");
  cacheLife("synced");

  const parties = await db.party.findMany({
    where: {
      politicians: {
        some: {
          publicationStatus: "PUBLISHED",
          mandates: {
            some: {
              isCurrent: true,
              type: { in: ["DEPUTE", "SENATEUR"] },
            },
          },
        },
      },
    },
    select: {
      id: true,
      name: true,
      shortName: true,
      color: true,
      politicians: {
        where: {
          publicationStatus: "PUBLISHED",
          mandates: {
            some: {
              isCurrent: true,
              type: { in: ["DEPUTE", "SENATEUR"] },
            },
          },
        },
        select: {
          id: true,
          declarations: {
            where: { type: "INTERETS" },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });

  return parties
    .map((p) => {
      const total = p.politicians.length;
      const withDeclaration = p.politicians.filter((pol) => pol.declarations.length > 0).length;
      return {
        partyId: p.id,
        partyName: p.name,
        partyShortName: p.shortName,
        partyColor: p.color,
        totalParliamentarians: total,
        withDeclaration,
        rate: total > 0 ? Math.round((withDeclaration / total) * 100) : 0,
      };
    })
    .filter((p) => p.totalParliamentarians >= 3)
    .sort((a, b) => b.rate - a.rate || b.totalParliamentarians - a.totalParliamentarians);
}
