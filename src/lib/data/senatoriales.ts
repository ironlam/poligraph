/**
 * Data access for the Sénatoriales 2026 section.
 *
 * Two constraints shape everything here.
 *
 * The reader does not vote at this ballot, so the useful unit is not "your
 * candidate" but "your commune's weight in the college". Queries are therefore keyed
 * on communes and departments, not on candidacies (of which there are none: senate
 * candidacies have no national open data).
 *
 * And two fields are deliberately not exposed even though they exist in the database:
 * senatorial start dates (see issue #698) and senator vote participation (323 of 339
 * sit at exactly 100 %, because the Senate scrutin import records no absences). Both
 * would render a data defect as a public claim.
 */

import { cache } from "react";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma";
import { resolveElectionStatus } from "@/lib/elections/status";
import { getMisEnCauseWhere } from "@/lib/affairs/public-filters";
import { COMMUNE_DATA_SYNC_KEY } from "@/config/communes";
import { computeCommuneCollege, type CommuneCollege } from "@/lib/senatoriales/college";
import type { ElectionStatus } from "@/types";

export const SENATORIALES_2026_SLUG = "senatoriales-2026";

/** Series renewed on 27 September 2026. */
const RENEWED_SERIES = 2;

// ─── Election ───────────────────────────────────────────────────────

export interface SenatorialesElection {
  id: string;
  title: string;
  shortTitle: string | null;
  description: string | null;
  round1Date: Date | null;
  dateConfirmed: boolean;
  candidacyOpenDate: Date | null;
  candidacyDeadline: Date | null;
  totalSeats: number | null;
  decreeUrl: string | null;
  sourceUrl: string | null;
  /** Phase derived at read time: the stored column never transitions on its own. */
  status: ElectionStatus;
}

export const getSenatorialesElection = cache(
  async function getSenatorialesElection(): Promise<SenatorialesElection | null> {
    const election = await db.election.findUnique({
      where: { slug: SENATORIALES_2026_SLUG },
      select: {
        id: true,
        title: true,
        shortTitle: true,
        description: true,
        round1Date: true,
        round2Date: true,
        dateConfirmed: true,
        candidacyOpenDate: true,
        candidacyDeadline: true,
        totalSeats: true,
        decreeUrl: true,
        sourceUrl: true,
        status: true,
      },
    });
    if (!election) return null;

    const { round2Date, ...rest } = election;
    return { ...rest, status: resolveElectionStatus({ ...election, round2Date }) };
  }
);

// ─── Seats at stake, per parliamentary group ────────────────────────

export interface GroupExposure {
  groupName: string;
  shortName: string | null;
  color: string | null;
  /** Seats the group holds today, across both series. */
  held: number;
  /** Of those, the ones renewed on 27 September. */
  atStake: number;
}

/**
 * How exposed each group is to this renewal.
 *
 * Computed from `Mandate.senateSeries` rather than quoted from a press tally, which
 * makes the Senate the only source needed. The three figures the design cited
 * (107/190 for the outgoing majority, 77/131 for Les Républicains, 4/18 for the
 * communists) fall out of this query exactly.
 */
export const getGroupExposure = cache(async function getGroupExposure(): Promise<GroupExposure[]> {
  const rows = await db.$queryRaw<
    Array<{
      groupName: string;
      shortName: string | null;
      color: string | null;
      held: number;
      atStake: number;
    }>
  >(Prisma.sql`
    SELECT g.name AS "groupName",
           g."shortName",
           g.color,
           COUNT(*)::int AS held,
           COUNT(*) FILTER (WHERE m."senateSeries" = ${RENEWED_SERIES})::int AS "atStake"
    FROM "Mandate" m
    JOIN "MandateParliamentary" mp ON mp."mandateId" = m.id
    JOIN "ParliamentaryGroup" g ON g.id = mp."parliamentaryGroupId"
    WHERE m.type = 'SENATEUR'
      AND m."isCurrent" = true
      AND m."senateSeries" IS NOT NULL
    GROUP BY 1, 2, 3
    ORDER BY held DESC
  `);
  return rows;
});

// ─── Department series ──────────────────────────────────────────────

export type DepartmentRenewal = "renewed" | "not-renewed" | "unknown";

/**
 * Whether a department's seats are up on 27 September.
 *
 * A department belongs entirely to one series, so the series of its sitting senators
 * settles it. When a department carries both values, the data is inconsistent and we
 * return "unknown" rather than picking a side: the page then says it does not know.
 */
export const getDepartmentRenewal = cache(async function getDepartmentRenewal(
  departmentCode: string
): Promise<DepartmentRenewal> {
  const rows = await db.mandate.findMany({
    where: {
      type: "SENATEUR",
      isCurrent: true,
      departmentCode,
      senateSeries: { not: null },
    },
    select: { senateSeries: true },
    distinct: ["senateSeries"],
  });
  if (rows.length !== 1) return "unknown";
  return rows[0]!.senateSeries === RENEWED_SERIES ? "renewed" : "not-renewed";
});

// ─── Sitting senators of a department ───────────────────────────────

export interface SittingSenator {
  slug: string;
  fullName: string;
  civility: string | null;
  photoUrl: string | null;
  constituency: string | null;
  /** 1 or 2, null when the sync has not filled it. */
  series: number | null;
  groupName: string | null;
  groupShortName: string | null;
  groupColor: string | null;
  /** Latest published HATVP declaration year, null when none is published. */
  declarationYear: number | null;
  /**
   * Ongoing published proceedings where the person is mis en cause. A discreet signal
   * on the card, never a filter, never a sort key, never an aggregate.
   */
  ongoingProceedings: number;
}

export const getSittingSenators = cache(async function getSittingSenators(
  departmentCode: string
): Promise<SittingSenator[]> {
  const mandates = await db.mandate.findMany({
    where: { type: "SENATEUR", isCurrent: true, departmentCode },
    select: {
      constituency: true,
      senateSeries: true,
      politician: {
        select: {
          id: true,
          slug: true,
          fullName: true,
          civility: true,
          photoUrl: true,
          declarations: {
            select: { year: true },
            orderBy: { year: "desc" },
            take: 1,
          },
        },
      },
      parliamentaryData: {
        select: {
          parliamentaryGroup: { select: { name: true, shortName: true, color: true } },
        },
      },
    },
    orderBy: { politician: { lastName: "asc" } },
  });

  if (mandates.length === 0) return [];

  // One grouped count instead of one query per senator. The where-builder is the
  // centralised one: no hand-rolled publicationStatus filter on a public surface.
  const politicianIds = mandates.map((m) => m.politician.id);
  const proceedings = await db.affair.groupBy({
    by: ["politicianId"],
    where: { politicianId: { in: politicianIds }, ...getMisEnCauseWhere() },
    _count: { _all: true },
  });
  const byPolitician = new Map(proceedings.map((p) => [p.politicianId, p._count._all]));

  return mandates.map((m) => ({
    slug: m.politician.slug,
    fullName: m.politician.fullName,
    civility: m.politician.civility,
    photoUrl: m.politician.photoUrl,
    constituency: m.constituency,
    series: m.senateSeries,
    groupName: m.parliamentaryData?.parliamentaryGroup.name ?? null,
    groupShortName: m.parliamentaryData?.parliamentaryGroup.shortName ?? null,
    groupColor: m.parliamentaryData?.parliamentaryGroup.color ?? null,
    declarationYear: m.politician.declarations[0]?.year ?? null,
    ongoingProceedings: byPolitician.get(m.politician.id) ?? 0,
  }));
});

// ─── Commune lookup ────────────────────────────────────────────────

export interface CommuneCollegeView {
  id: string;
  name: string;
  departmentCode: string;
  departmentName: string;
  college: CommuneCollege | null;
  renewal: DepartmentRenewal;
  /** Seats up in this department on 27 September, null when not renewed or unknown. */
  seatsAtStake: number | null;
}

/**
 * Communes matching an exact 5-digit postal code.
 *
 * A postal code is not a commune identifier: 4,204 of them cover several communes,
 * one of them covers 46. The caller must disambiguate, so this returns every match
 * rather than silently keeping the largest.
 *
 * Arrondissements need no special handling: `Commune.postalCodes` carries all 21
 * Parisian codes on the single 75056 row, so `75011` resolves to Paris. An
 * arrondissement designates no senatorial delegate, the Conseil de Paris does.
 */
export async function findCommunesByPostalCode(
  postalCode: string
): Promise<Array<{ id: string; name: string; departmentCode: string; departmentName: string }>> {
  if (!/^[0-9]{5}$/.test(postalCode)) return [];
  return db.commune.findMany({
    where: { postalCodes: { has: postalCode } },
    select: { id: true, name: true, departmentCode: true, departmentName: true },
    orderBy: [{ population: "desc" }, { name: "asc" }],
    take: 50,
  });
}

/** Seats up for renewal in a department, counted from the sitting senators. */
async function countSeatsAtStake(departmentCode: string): Promise<number> {
  return db.mandate.count({
    where: {
      type: "SENATEUR",
      isCurrent: true,
      departmentCode,
      senateSeries: RENEWED_SERIES,
    },
  });
}

export const getCommuneCollege = cache(async function getCommuneCollege(
  communeId: string
): Promise<CommuneCollegeView | null> {
  const commune = await db.commune.findUnique({
    where: { id: communeId },
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

  const [renewal, seats] = await Promise.all([
    getDepartmentRenewal(commune.departmentCode),
    countSeatsAtStake(commune.departmentCode),
  ]);

  return {
    id: commune.id,
    name: commune.name,
    departmentCode: commune.departmentCode,
    departmentName: commune.departmentName,
    college: computeCommuneCollege({
      communeId: commune.id,
      population: commune.population,
      totalSeats: commune.totalSeats,
    }),
    renewal,
    seatsAtStake: renewal === "renewed" ? seats : null,
  };
});

// ─── Provenance ────────────────────────────────────────────────────

/**
 * When we last read the commune reference from geo.api.gouv.fr.
 *
 * The API publishes no population vintage, so surfaces date the import instead of
 * claiming a year. Null when the seed has not recorded a run yet, in which case the
 * page says the provenance is undated rather than inventing one.
 */
export const getCommuneDataFetchedAt = cache(
  async function getCommuneDataFetchedAt(): Promise<Date | null> {
    const row = await db.syncMetadata.findUnique({
      where: { sourceKey: COMMUNE_DATA_SYNC_KEY },
      select: { lastSyncAt: true },
    });
    return row?.lastSyncAt ?? null;
  }
);
