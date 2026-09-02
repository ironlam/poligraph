import { cacheTag, cacheLife } from "next/cache";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma";
import type { MandateType, AffairStatus, Involvement } from "@/generated/prisma";
import {
  PUBLIC_PARTY_WHERE,
  PUBLIC_POLITICIAN_PUBLICATION_STATUS,
  PUBLIC_POLITICIAN_WHERE,
} from "@/lib/api/public-contract";
import { getPublishedAffairSqlWhere, getPublishedAffairWhere } from "@/lib/affairs/public-filters";

export const MANDAT_BUCKETS: Record<string, MandateType[]> = {
  depute: ["DEPUTE", "DEPUTE_EUROPEEN"],
  senateur: ["SENATEUR"],
  gouvernement: [
    "PRESIDENT_REPUBLIQUE",
    "PREMIER_MINISTRE",
    "MINISTRE",
    "SECRETAIRE_ETAT",
    "MINISTRE_DELEGUE",
  ],
  locaux: [
    "MAIRE",
    "ADJOINT_MAIRE",
    "PRESIDENT_REGION",
    "PRESIDENT_DEPARTEMENT",
    "CONSEILLER_REGIONAL",
    "CONSEILLER_DEPARTEMENTAL",
    "CONSEILLER_MUNICIPAL",
  ],
};

export type MandatBucket = keyof typeof MANDAT_BUCKETS;

export const CERTAINTY_STATUS: Record<"etabli" | "prononcee" | "tous", AffairStatus[] | "all"> = {
  etabli: ["CONDAMNATION_DEFINITIVE"],
  // APPEL_EN_COURS is included because Poligraph convention is: appeal filed
  // AFTER first-instance conviction. Marginal "acquittal + prosecution appeal"
  // cases are rare and remain visible in the `sentence` field.
  prononcee: ["CONDAMNATION_PREMIERE_INSTANCE", "APPEL_EN_COURS", "POURVOI_EN_CASSATION"],
  tous: "all",
};

export type CertaintyKey = keyof typeof CERTAINTY_STATUS;

export interface CondamnationsFilters {
  mandat?: MandatBucket;
  certainty?: CertaintyKey;
  partiSlug?: string;
  page?: number;
  sort?: "date" | "nom" | "severity";
}

const PAGE_SIZE = 30;

export async function getCondamnations(filters: CondamnationsFilters) {
  "use cache";
  cacheTag("affairs");
  cacheLife("synced");

  const { mandat, certainty = "tous", partiSlug, page = 1, sort = "date" } = filters;

  const mandateTypes = mandat ? MANDAT_BUCKETS[mandat] : undefined;
  const statuses = CERTAINTY_STATUS[certainty];

  const where: Prisma.AffairWhereInput = {
    ...getPublishedAffairWhere(),
    involvement: { in: ["DIRECT", "INDIRECT"] as Involvement[] },
    ...(statuses !== "all" && { status: { in: statuses } }),
    ...(partiSlug && {
      OR: [
        { partyAtTime: { slug: partiSlug, ...PUBLIC_PARTY_WHERE } },
        { politician: { currentParty: { slug: partiSlug, ...PUBLIC_PARTY_WHERE } } },
      ],
    }),
    politician: {
      ...(mandateTypes && { mandates: { some: { type: { in: mandateTypes } } } }),
      ...PUBLIC_POLITICIAN_WHERE,
    },
  };

  const orderBy = orderByForSort(sort);

  const [affairs, total] = await Promise.all([
    db.affair.findMany({
      where,
      include: {
        politician: {
          include: {
            currentParty: {
              select: {
                id: true,
                slug: true,
                shortName: true,
                name: true,
                publicId: true,
                foundedDate: true,
              },
            },
          },
        },
        partyAtTime: {
          select: {
            id: true,
            slug: true,
            shortName: true,
            name: true,
            publicId: true,
            foundedDate: true,
            _count: { select: { politicians: { where: PUBLIC_POLITICIAN_WHERE } } },
          },
        },
        sources: { select: { id: true } },
      },
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
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
              publicId: a.partyAtTime.publicId,
              foundedDate: a.partyAtTime.foundedDate,
            }
          : null;
      return {
        ...a,
        partyAtTime,
        fineAmount: a.fineAmount !== null ? Number(a.fineAmount) : null,
      };
    }),
    total,
    totalPages: Math.ceil(total / PAGE_SIZE) || 1,
    page,
  };
}

function orderByForSort(
  sort: "date" | "nom" | "severity"
): Prisma.AffairOrderByWithRelationInput[] {
  switch (sort) {
    case "nom":
      return [{ politician: { lastName: "asc" } }, { politician: { firstName: "asc" } }];
    case "severity":
      return [{ severity: "asc" }, { verdictDate: "desc" }];
    case "date":
    default:
      return [{ verdictDate: "desc" }, { startDate: "desc" }, { createdAt: "desc" }];
  }
}

export interface CondamnationsPartyStats {
  partyId: string;
  partySlug: string;
  partyShortName: string;
  partyName: string;
  nSuivis: number;
  nCondamnesDefinitifs: number;
  nCondamnesPrononces: number;
  tauxDefinitif: number;
}

export async function getCondamnationsStatsByParty(
  mandat?: MandatBucket
): Promise<CondamnationsPartyStats[]> {
  "use cache";
  cacheTag("affairs");

  const mandateTypes = mandat ? MANDAT_BUCKETS[mandat] : undefined;

  const rows = await db.$queryRaw<
    Array<{
      partyId: string;
      partySlug: string;
      partyShortName: string;
      partyName: string;
      nSuivis: bigint;
      nCondamnesDefinitifs: bigint;
      nCondamnesPrononces: bigint;
    }>
  >(Prisma.sql`
    SELECT
      pt.id AS "partyId",
      pt.slug AS "partySlug",
      pt."shortName" AS "partyShortName",
      pt.name AS "partyName",
      COUNT(DISTINCT p.id) AS "nSuivis",
      COUNT(DISTINCT CASE WHEN a.status = 'CONDAMNATION_DEFINITIVE' THEN a."politicianId" END) AS "nCondamnesDefinitifs",
      COUNT(DISTINCT CASE WHEN a.status IN ('CONDAMNATION_PREMIERE_INSTANCE','APPEL_EN_COURS') THEN a."politicianId" END) AS "nCondamnesPrononces"
    FROM "Politician" p
    JOIN "Party" pt ON pt.id = p."currentPartyId"
    LEFT JOIN "Affair" a ON a."politicianId" = p.id
      AND ${getPublishedAffairSqlWhere()}
      AND a.involvement IN ('DIRECT','INDIRECT')
    WHERE p."publicationStatus" = ${PUBLIC_POLITICIAN_PUBLICATION_STATUS}
    ${
      mandateTypes
        ? Prisma.sql`AND EXISTS (SELECT 1 FROM "Mandate" m WHERE m."politicianId" = p.id AND m.type = ANY(${mandateTypes}::"MandateType"[]))`
        : Prisma.empty
    }
    GROUP BY pt.id, pt.slug, pt."shortName", pt.name
    HAVING COUNT(DISTINCT p.id) >= 3
        OR COUNT(DISTINCT CASE WHEN a.status = 'CONDAMNATION_DEFINITIVE' THEN a."politicianId" END) >= 1
    ORDER BY "nCondamnesDefinitifs" DESC, "nSuivis" DESC
  `);

  return rows.map((r) => ({
    partyId: r.partyId,
    partySlug: r.partySlug,
    partyShortName: r.partyShortName,
    partyName: r.partyName,
    nSuivis: Number(r.nSuivis),
    nCondamnesDefinitifs: Number(r.nCondamnesDefinitifs),
    nCondamnesPrononces: Number(r.nCondamnesPrononces),
    tauxDefinitif: Number(r.nSuivis) > 0 ? Number(r.nCondamnesDefinitifs) / Number(r.nSuivis) : 0,
  }));
}
