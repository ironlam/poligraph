import { cache } from "react";
import { cacheTag, cacheLife } from "next/cache";
import { Prisma, ElectionType as ElectionTypeEnum } from "@/generated/prisma";
import { pickEnumValue } from "@/lib/data/enum-guards";
import { db } from "@/lib/db";
import type { ElectionType } from "@/types";
import type { ElectionRoundScore } from "@/lib/elections/banner-state";
import { isElectionOver } from "@/lib/elections/status";
import { NAV_ELECTIONS } from "@/config/navigation";

// ============================================
// Types
// ============================================

export interface Municipales2020Stats {
  totalCandidacies: number;
  totalCommunes: number;
  totalLists: number;
  electedMayorsCount: number;
}

export interface ElectionRoundData {
  round: number;
  date: Date;
  registeredVoters: number | null;
  actualVoters: number | null;
  participationRate: number | null;
  blankVotes: number | null;
  nullVotes: number | null;
}

export interface DepartmentResult2020 {
  departmentCode: string;
  departmentName: string;
  communeCount: number;
  candidacyCount: number;
  listCount: number;
}

export interface CommuneListResult2020 {
  listName: string;
  partyLabel: string | null;
  candidateName: string;
  round1Votes: number | null;
  round1Pct: number | null;
  round1Qualified: boolean | null;
  round2Votes: number | null;
  round2Pct: number | null;
  isElected: boolean;
  candidateCount: number;
}

export interface CommuneResult2020 {
  inseeCode: string;
  communeName: string;
  departmentCode: string;
  departmentName: string;
  population: number | null;
  totalSeats: number | null;
  lists: CommuneListResult2020[];
}

// ============================================
// Helper: resolve election ID for municipales-2020
// ============================================

const getElectionId = cache(async function getElectionId(): Promise<string | null> {
  const election = await db.election.findUnique({
    where: { slug: "municipales-2020" },
    select: { id: true },
  });
  return election?.id ?? null;
});

// ============================================
// 1. getMunicipales2020Stats
// ============================================

export const getMunicipales2020Stats = cache(
  async function getMunicipales2020Stats(): Promise<Municipales2020Stats | null> {
    const electionId = await getElectionId();
    if (!electionId) return null;

    const [totalCandidacies, communeGroups, listGroups, electedMayorsCount] = await Promise.all([
      db.candidacy.count({
        where: { electionId },
      }),

      db.candidacy.groupBy({
        by: ["communeId"],
        where: { electionId, communeId: { not: null } },
      }),

      db.candidacy.groupBy({
        by: ["listName", "communeId"],
        where: { electionId, listName: { not: null }, communeId: { not: null } },
      }),

      db.candidacy.count({
        where: {
          electionId,
          isElected: true,
          listPosition: 1,
        },
      }),
    ]);

    return {
      totalCandidacies,
      totalCommunes: communeGroups.length,
      totalLists: listGroups.length,
      electedMayorsCount,
    };
  }
);

// ============================================
// 2. getMunicipales2020Rounds
// ============================================

export const getMunicipales2020Rounds = cache(async function getMunicipales2020Rounds(): Promise<
  ElectionRoundData[]
> {
  const electionId = await getElectionId();
  if (!electionId) return [];

  const rounds = await db.electionRound.findMany({
    where: { electionId },
    orderBy: { round: "asc" },
  });

  return rounds.map((r) => ({
    round: r.round,
    date: r.date,
    registeredVoters: r.registeredVoters,
    actualVoters: r.actualVoters,
    participationRate: r.participationRate ? Number(r.participationRate) : null,
    blankVotes: r.blankVotes,
    nullVotes: r.nullVotes,
  }));
});

// ============================================
// 3. getDepartmentResults2020
// ============================================

export const getDepartmentResults2020 = cache(async function getDepartmentResults2020(): Promise<
  DepartmentResult2020[]
> {
  const electionId = await getElectionId();
  if (!electionId) return [];

  const rows = await db.$queryRaw<DepartmentResult2020[]>(Prisma.sql`
      SELECT
        co."departmentCode" AS "departmentCode",
        co."departmentName" AS "departmentName",
        COUNT(DISTINCT co.id)::int AS "communeCount",
        COUNT(c.id)::int AS "candidacyCount",
        COUNT(DISTINCT (c."listName", co.id))::int AS "listCount"
      FROM "Candidacy" c
      JOIN "Commune" co ON c."communeId" = co.id
      WHERE c."electionId" = ${electionId}
      GROUP BY co."departmentCode", co."departmentName"
      ORDER BY co."departmentCode" ASC
    `);

  return rows;
});

// ============================================
// 4. getCommuneResults2020
// ============================================

export const getCommuneResults2020 = cache(async function getCommuneResults2020(
  inseeCode: string
): Promise<CommuneResult2020 | null> {
  const electionId = await getElectionId();
  if (!electionId) return null;

  // Fetch commune info
  const commune = await db.commune.findUnique({
    where: { id: inseeCode },
    select: {
      id: true,
      name: true,
      departmentCode: true,
      departmentName: true,
      population: true,
      totalSeats: true,
    },
  });
  if (!commune) return null;

  // Fetch all candidacies for this commune
  const candidacies = await db.candidacy.findMany({
    where: { electionId, communeId: inseeCode },
    select: {
      candidateName: true,
      listName: true,
      listPosition: true,
      partyLabel: true,
      round1Votes: true,
      round1Pct: true,
      round1Qualified: true,
      round2Votes: true,
      round2Pct: true,
      isElected: true,
    },
    orderBy: [{ listName: "asc" }, { listPosition: "asc" }],
  });

  if (candidacies.length === 0) {
    return {
      inseeCode: commune.id,
      communeName: commune.name,
      departmentCode: commune.departmentCode,
      departmentName: commune.departmentName,
      population: commune.population,
      totalSeats: commune.totalSeats,
      lists: [],
    };
  }

  // Group candidacies by listName
  const listsMap = new Map<
    string,
    {
      partyLabel: string | null;
      teteDeListe: string;
      round1Votes: number | null;
      round1Pct: number | null;
      round1Qualified: boolean | null;
      round2Votes: number | null;
      round2Pct: number | null;
      isElected: boolean;
      candidateCount: number;
    }
  >();

  for (const c of candidacies) {
    const key = c.listName || c.candidateName;
    const existing = listsMap.get(key);
    if (!existing) {
      // First candidate in this list — use them as tete de liste
      listsMap.set(key, {
        partyLabel: c.partyLabel,
        teteDeListe: c.candidateName,
        round1Votes: c.round1Votes,
        round1Pct: c.round1Pct ? Number(c.round1Pct) : null,
        round1Qualified: c.round1Qualified,
        round2Votes: c.round2Votes,
        round2Pct: c.round2Pct ? Number(c.round2Pct) : null,
        isElected: c.isElected,
        candidateCount: 1,
      });
    } else {
      existing.candidateCount += 1;
      // If this candidate is tete de liste (position 1), use their data
      if (c.listPosition === 1) {
        existing.teteDeListe = c.candidateName;
        existing.round1Votes = c.round1Votes;
        existing.round1Pct = c.round1Pct ? Number(c.round1Pct) : null;
        existing.round1Qualified = c.round1Qualified;
        existing.round2Votes = c.round2Votes;
        existing.round2Pct = c.round2Pct ? Number(c.round2Pct) : null;
        existing.isElected = c.isElected;
      }
      // Propagate isElected = true from any list member
      if (c.isElected) {
        existing.isElected = true;
      }
    }
  }

  // Build lists array and sort: elected first, then by round1Pct desc
  const lists: CommuneListResult2020[] = Array.from(listsMap.entries())
    .map(([listName, data]) => ({
      listName,
      partyLabel: data.partyLabel,
      candidateName: data.teteDeListe,
      round1Votes: data.round1Votes,
      round1Pct: data.round1Pct,
      round1Qualified: data.round1Qualified,
      round2Votes: data.round2Votes,
      round2Pct: data.round2Pct,
      isElected: data.isElected,
      candidateCount: data.candidateCount,
    }))
    .sort((a, b) => {
      // Elected lists first
      if (a.isElected !== b.isElected) return a.isElected ? -1 : 1;
      // Then by round1Pct descending
      return (b.round1Pct ?? 0) - (a.round1Pct ?? 0);
    });

  return {
    inseeCode: commune.id,
    communeName: commune.name,
    departmentCode: commune.departmentCode,
    departmentName: commune.departmentName,
    population: commune.population,
    totalSeats: commune.totalSeats,
    lists,
  };
});

// ============================================
// Municipales 2014 — Types
// ============================================

export interface Municipales2014Stats {
  totalCandidacies: number;
  totalCommunes: number;
  electedCount: number;
}

export interface DepartmentResult2014 {
  departmentCode: string;
  departmentName: string;
  communeCount: number;
  candidacyCount: number;
}

export interface CommuneListResult2014 {
  listName: string;
  partyLabel: string | null;
  candidateName: string;
  round1Votes: number | null;
  round1Pct: number | null;
  round2Votes: number | null;
  round2Pct: number | null;
  isElected: boolean;
}

export interface CommuneResult2014 {
  inseeCode: string;
  communeName: string;
  departmentCode: string;
  departmentName: string;
  population: number | null;
  totalSeats: number | null;
  lists: CommuneListResult2014[];
}

// ============================================
// Municipales 2014 — Helper
// ============================================

const getElection2014Id = cache(async function getElection2014Id(): Promise<string | null> {
  const election = await db.election.findUnique({
    where: { slug: "municipales-2014" },
    select: { id: true },
  });
  return election?.id ?? null;
});

// ============================================
// Municipales 2014 — Stats
// ============================================

export const getMunicipales2014Stats = cache(
  async function getMunicipales2014Stats(): Promise<Municipales2014Stats | null> {
    const electionId = await getElection2014Id();
    if (!electionId) return null;

    const [totalCandidacies, communeGroups, electedCount] = await Promise.all([
      db.candidacy.count({ where: { electionId } }),
      db.candidacy.groupBy({
        by: ["communeId"],
        where: { electionId, communeId: { not: null } },
      }),
      db.candidacy.count({ where: { electionId, isElected: true } }),
    ]);

    return {
      totalCandidacies,
      totalCommunes: communeGroups.length,
      electedCount,
    };
  }
);

// ============================================
// Municipales 2014 — Rounds
// ============================================

export const getMunicipales2014Rounds = cache(async function getMunicipales2014Rounds(): Promise<
  ElectionRoundData[]
> {
  const electionId = await getElection2014Id();
  if (!electionId) return [];

  const rounds = await db.electionRound.findMany({
    where: { electionId },
    orderBy: { round: "asc" },
  });

  return rounds.map((r) => ({
    round: r.round,
    date: r.date,
    registeredVoters: r.registeredVoters,
    actualVoters: r.actualVoters,
    participationRate: r.participationRate ? Number(r.participationRate) : null,
    blankVotes: r.blankVotes,
    nullVotes: r.nullVotes,
  }));
});

// ============================================
// Municipales 2014 — Department results
// ============================================

export const getDepartmentResults2014 = cache(async function getDepartmentResults2014(): Promise<
  DepartmentResult2014[]
> {
  const electionId = await getElection2014Id();
  if (!electionId) return [];

  const rows = await db.$queryRaw<DepartmentResult2014[]>(Prisma.sql`
    SELECT
      co."departmentCode" AS "departmentCode",
      co."departmentName" AS "departmentName",
      COUNT(DISTINCT co.id)::int AS "communeCount",
      COUNT(c.id)::int AS "candidacyCount"
    FROM "Candidacy" c
    JOIN "Commune" co ON c."communeId" = co.id
    WHERE c."electionId" = ${electionId}
    GROUP BY co."departmentCode", co."departmentName"
    ORDER BY co."departmentCode" ASC
  `);

  return rows;
});

// ============================================
// Municipales 2014 — Commune results
// ============================================

export const getCommuneResults2014 = cache(async function getCommuneResults2014(
  inseeCode: string
): Promise<CommuneResult2014 | null> {
  const electionId = await getElection2014Id();
  if (!electionId) return null;

  const commune = await db.commune.findUnique({
    where: { id: inseeCode },
    select: {
      id: true,
      name: true,
      departmentCode: true,
      departmentName: true,
      population: true,
      totalSeats: true,
    },
  });
  if (!commune) return null;

  // 2014 import has one candidacy per list (tête de liste only)
  const candidacies = await db.candidacy.findMany({
    where: { electionId, communeId: inseeCode },
    select: {
      candidateName: true,
      listName: true,
      partyLabel: true,
      round1Votes: true,
      round1Pct: true,
      round2Votes: true,
      round2Pct: true,
      isElected: true,
    },
    orderBy: [{ isElected: "desc" }, { round1Pct: "desc" }],
  });

  const lists: CommuneListResult2014[] = candidacies.map((c) => ({
    listName: c.listName || c.candidateName,
    partyLabel: c.partyLabel,
    candidateName: c.candidateName,
    round1Votes: c.round1Votes,
    round1Pct: c.round1Pct ? Number(c.round1Pct) : null,
    round2Votes: c.round2Votes,
    round2Pct: c.round2Pct ? Number(c.round2Pct) : null,
    isElected: c.isElected,
  }));

  return {
    inseeCode: commune.id,
    communeName: commune.name,
    departmentCode: commune.departmentCode,
    departmentName: commune.departmentName,
    population: commune.population,
    totalSeats: commune.totalSeats,
    lists,
  };
});

// ============================================
// 5. getUpcomingElections
// ============================================

export async function getUpcomingElections() {
  "use cache";
  cacheTag("elections", "homepage");
  cacheLife("synced");

  const now = new Date();
  return db.election.findMany({
    where: {
      status: { not: "COMPLETED" },
      round1Date: { gte: now },
    },
    orderBy: { round1Date: "asc" },
    take: 4,
  });
}

// ============================================
// 5a. getPastElectionSlugs — for the navigation
// ============================================

/**
 * Slugs, among the elections surfaced in the navigation, whose ballot has been held.
 *
 * Resolved here rather than written in `NAV_ELECTIONS` because a boolean in the config would keep
 * reading "À venir" the morning after the vote until someone deploys. Same read-time derivation as
 * the homepage banner: the stored `status` is only advanced by the candidacy sync, so the round
 * dates are what actually prove the ballot happened.
 *
 * `hours`, not `synced`: this answer flips on the clock, not only on a database write. Nothing
 * purges the "elections" tag on polling day (the daily sync revalidates "votes" alone), so with
 * `synced` the menu would keep saying "À venir" for up to 24 h after the ballot. `hours` is also
 * the profile `revalidateTag("elections", ELECTION_PROFILE)` already passes on the purge side.
 */
export async function getPastElectionSlugs(): Promise<string[]> {
  "use cache";
  cacheTag("elections");
  cacheLife("hours");

  const rows = await db.election.findMany({
    where: { slug: { in: NAV_ELECTIONS.map((item) => item.slug) } },
    select: { slug: true, status: true, round1Date: true, round2Date: true },
  });

  return rows.filter((election) => isElectionOver(election)).map((election) => election.slug);
}

// ============================================
// 5b. getFeaturedElection — for the homepage banner
// ============================================

/**
 * Days after the last round during which the election stays featured, in its archive state.
 *
 * Without this window the banner would vanish the moment the election completes, which is what
 * happened to municipales-2026: `status` is derived from the round dates, so the old
 * `status != COMPLETED` filter silently emptied the homepage banner slot. The archive state is also
 * the only state that carries no countdown, which is what stops the banner counting toward a date
 * in the past.
 */
export const FEATURED_ELECTION_ARCHIVE_DAYS = 30;

export type FeaturedElection = {
  slug: string;
  title: string;
  shortTitle: string | null;
  type: ElectionType;
  round1Date: Date | null;
  round2Date: Date | null;
  dateConfirmed: boolean;
  round1Scores: ElectionRoundScore[];
  winner: ElectionRoundScore | null;
  /** Candidacies with a status AND both source fields. The number the banner is allowed to show. */
  sourcedCandidacyCount: number;
  hasResults: boolean;
  communesDepouillees: number;
};

/**
 * Plain async, integration-testable. Pages call `getFeaturedElection`, which caches this.
 */
export async function loadFeaturedElection(): Promise<FeaturedElection | null> {
  const cutoff = new Date(Date.now() - FEATURED_ELECTION_ARCHIVE_DAYS * 24 * 60 * 60 * 1000);

  const election = await db.election.findFirst({
    where: {
      featured: true,
      // The archive window replaces the former `status != COMPLETED` filter. Measured on the last
      // known round: round2Date when there is one, round1Date otherwise.
      OR: [
        { round2Date: { gte: cutoff } },
        { round2Date: null, round1Date: { gte: cutoff } },
        { round1Date: null },
      ],
    },
    // Deterministic tie-break. Nothing in the schema forbids two featured rows, and without an
    // explicit order findFirst would arbitrate: the nearest deadline wins, and it is documented
    // here rather than discovered in production.
    orderBy: [{ round1Date: { sort: "asc", nulls: "last" } }, { slug: "asc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      shortTitle: true,
      type: true,
      round1Date: true,
      round2Date: true,
      dateConfirmed: true,
    },
  });
  if (!election) return null;

  const [sourcedCandidacyCount, qualified, elected, resultatsSnapshot] = await Promise.all([
    db.candidacy.count({
      where: {
        electionId: election.id,
        status: { not: null },
        sourceUrl: { not: null },
        sourceLabel: { not: null },
      },
    }),
    db.candidacy.findMany({
      where: { electionId: election.id, round1Qualified: true },
      select: {
        candidateName: true,
        partyLabel: true,
        round1Pct: true,
        politician: { select: { slug: true } },
      },
      orderBy: { round1Pct: { sort: "desc", nulls: "last" } },
      take: 2,
    }),
    db.candidacy.findFirst({
      where: { electionId: election.id, isElected: true },
      select: {
        candidateName: true,
        partyLabel: true,
        round2Pct: true,
        politician: { select: { slug: true } },
      },
    }),
    db.statsSnapshot.findUnique({ where: { key: `${election.slug}-resultats` } }),
  ]);

  const resultats = resultatsSnapshot?.data as { communesDepouillees?: number } | null;

  return {
    slug: election.slug,
    title: election.title,
    shortTitle: election.shortTitle,
    type: election.type,
    round1Date: election.round1Date,
    round2Date: election.round2Date,
    dateConfirmed: election.dateConfirmed,
    // A score is omitted rather than defaulted to zero: "0 %" would be a claim, absence is not.
    round1Scores: qualified.flatMap((c) =>
      c.round1Pct === null
        ? []
        : [
            {
              candidateName: c.candidateName,
              politicianSlug: c.politician?.slug ?? null,
              partyLabel: c.partyLabel,
              pct: Number(c.round1Pct),
            },
          ]
    ),
    winner:
      elected && elected.round2Pct !== null
        ? {
            candidateName: elected.candidateName,
            politicianSlug: elected.politician?.slug ?? null,
            partyLabel: elected.partyLabel,
            pct: Number(elected.round2Pct),
          }
        : null,
    sourcedCandidacyCount,
    hasResults: (resultats?.communesDepouillees ?? 0) > 0,
    communesDepouillees: resultats?.communesDepouillees ?? 0,
  };
}

export async function getFeaturedElection(): Promise<FeaturedElection | null> {
  "use cache";
  cacheTag("elections", "homepage");
  cacheLife("synced");
  return loadFeaturedElection();
}

// ============================================
// 6. getElections (listing with optional type filter)
// ============================================

export async function getElections(typeFilter?: ElectionType) {
  "use cache";
  cacheTag("elections");
  cacheLife("synced");

  // Defense-in-depth: the page already whitelists `type`, but this is a cached
  // boundary reachable from anywhere, and an out-of-enum value would both throw
  // in Prisma and mint a cache entry per payload.
  const safeType = pickEnumValue(typeFilter, ElectionTypeEnum);
  const where = safeType ? { type: safeType } : {};

  return db.election.findMany({
    where,
    orderBy: [{ round1Date: { sort: "asc", nulls: "last" } }],
  });
}

// ============================================
// 7. getTypeCounts
// ============================================

export async function getTypeCounts() {
  "use cache";
  cacheTag("elections");
  cacheLife("synced");

  return db.election.groupBy({
    by: ["type"],
    _count: true,
    orderBy: { _count: { type: "desc" } },
  });
}
