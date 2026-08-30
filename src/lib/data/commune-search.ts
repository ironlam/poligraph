import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma";

/**
 * Commune lookup shared by the municipal election autocomplete routes.
 *
 * `/api/elections/municipales-{2014,2020,2026}/communes` were three copies of the same file.
 * They drifted: the 2026 copy counted candidacies across *every* election because its SQL had
 * lost the `electionId` predicate, so Montpellier was served as 36 lists when it fields 13.
 * One implementation, the election passed in, removes the class of bug rather than the instance.
 */

const COMMUNE_FIELDS = {
  id: true,
  name: true,
  departmentCode: true,
  departmentName: true,
  population: true,
  totalSeats: true,
} as const;

/** Autocomplete rows cap out at 8; a department listing at 100. Both are deliberate. */
const TEXT_SEARCH_LIMIT = 8;
const DEPARTMENT_LIMIT = 100;

export interface CommuneSummary {
  id: string;
  name: string;
  departmentCode: string;
  departmentName: string;
  population: number | null;
  totalSeats: number | null;
  listCount: number;
  candidateCount: number;
}

export interface CommuneSearchScope {
  /** Candidacy counts are always scoped to one election. */
  electionId: string;
  /**
   * 2014 stored one Candidacy row per list, later years one per candidate. Counting distinct
   * list names on 2014 data would collapse two same-named lists into one.
   */
  listCounting: "rows" | "distinct-names";
}

type CommuneRow = {
  id: string;
  name: string;
  departmentCode: string;
  departmentName: string;
  population: number | null;
  totalSeats: number | null;
};

type CandidacyStatsRow = {
  communeId: string;
  listCount: number;
  candidateCount: number;
};

export async function getElectionIdBySlug(slug: string): Promise<string | null> {
  const election = await db.election.findUnique({ where: { slug }, select: { id: true } });
  return election?.id ?? null;
}

/** "01", "2A", "974". Rejects anything else before it reaches a query. */
export function isValidDepartmentCode(code: string): boolean {
  return /^[0-9]{1,3}[AB]?$/i.test(code);
}

async function getCandidacyStats(
  communeIds: string[],
  scope: CommuneSearchScope
): Promise<Map<string, { listCount: number; candidateCount: number }>> {
  const map = new Map<string, { listCount: number; candidateCount: number }>();
  if (communeIds.length === 0) return map;

  const listCount =
    scope.listCounting === "rows"
      ? Prisma.sql`COUNT(*)::int`
      : Prisma.sql`COUNT(DISTINCT c."listName")::int`;

  const rows = await db.$queryRaw<CandidacyStatsRow[]>(Prisma.sql`
    SELECT c."communeId",
           ${listCount} as "listCount",
           COUNT(*)::int as "candidateCount"
    FROM "Candidacy" c
    WHERE c."communeId" = ANY(${communeIds}::text[])
      AND c."electionId" = ${scope.electionId}
    GROUP BY c."communeId"
  `);

  for (const row of rows) {
    map.set(row.communeId, {
      listCount: row.listCount,
      candidateCount: row.candidateCount,
    });
  }
  return map;
}

async function withStats(
  communes: CommuneRow[],
  scope: CommuneSearchScope
): Promise<CommuneSummary[]> {
  const stats = await getCandidacyStats(
    communes.map((c) => c.id),
    scope
  );

  return communes.map((commune) => {
    const counts = stats.get(commune.id);
    return {
      ...commune,
      listCount: counts?.listCount ?? 0,
      candidateCount: counts?.candidateCount ?? 0,
    };
  });
}

export interface TextSearchOptions {
  /** Restrict to one department, when the caller already knows it. */
  departmentCode?: string | undefined;
  /** Keep only communes that have a first-round record *for this election*. */
  withRound1ResultsOnly?: boolean | undefined;
}

/**
 * Free text: a commune name, a full postal code, or a department code.
 *
 * Never cached. The key would be unbounded, and `AGENTS.md` §5 forbids `"use cache"` on
 * free-text parameters for that reason.
 */
export async function searchCommunesByText(
  query: string,
  scope: CommuneSearchScope,
  options: TextSearchOptions = {}
): Promise<CommuneSummary[]> {
  if (query.length < 2) return [];

  const filters: Prisma.CommuneWhereInput = {
    ...(options.departmentCode ? { departmentCode: options.departmentCode.toUpperCase() } : {}),
    ...(options.withRound1ResultsOnly
      ? { communeElectionRounds: { some: { round: 1, electionId: scope.electionId } } }
      : {}),
  };

  const byName: Prisma.CommuneWhereInput = {
    name: { contains: query, mode: "insensitive" },
    ...filters,
  };

  // A 4-digit run is an incomplete postal code. Postgres cannot index a prefix of an array
  // element, so there is nothing efficient to run: fall back to the name search.
  const where: Prisma.CommuneWhereInput = !/^\d{2,5}$/.test(query)
    ? byName
    : query.length === 5
      ? { postalCodes: { has: query }, ...filters }
      : query.length <= 3
        ? { departmentCode: query, ...filters }
        : byName;

  const communes = await db.commune.findMany({
    where,
    select: COMMUNE_FIELDS,
    orderBy: { population: "desc" },
    take: TEXT_SEARCH_LIMIT,
  });

  return withStats(communes, scope);
}

export async function findCommuneByInsee(
  inseeCode: string,
  scope: CommuneSearchScope
): Promise<CommuneSummary | null> {
  const commune = await db.commune.findUnique({
    where: { id: inseeCode },
    select: COMMUNE_FIELDS,
  });
  if (!commune) return null;

  const [summary] = await withStats([commune], scope);
  return summary ?? null;
}

/** Bounded set (about 101 departments), so callers may cache the response. */
export async function listCommunesByDepartment(
  departmentCode: string,
  scope: CommuneSearchScope
): Promise<CommuneSummary[]> {
  const communes = await db.commune.findMany({
    where: { departmentCode: departmentCode.toUpperCase() },
    select: COMMUNE_FIELDS,
    orderBy: { population: "desc" },
    take: DEPARTMENT_LIMIT,
  });

  return withStats(communes, scope);
}
