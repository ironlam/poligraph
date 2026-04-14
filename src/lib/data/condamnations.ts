import { cacheTag, cacheLife } from "next/cache";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma";
import type { MandateType, AffairStatus, Involvement } from "@/generated/prisma";

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
  prononcee: ["CONDAMNATION_PREMIERE_INSTANCE", "APPEL_EN_COURS"],
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
  cacheLife("minutes");

  const { mandat, certainty = "tous", partiSlug, page = 1, sort = "date" } = filters;

  const mandateTypes = mandat ? MANDAT_BUCKETS[mandat] : undefined;
  const statuses = CERTAINTY_STATUS[certainty];

  const where: Prisma.AffairWhereInput = {
    publicationStatus: "PUBLISHED",
    involvement: { in: ["DIRECT", "INDIRECT"] as Involvement[] },
    ...(statuses !== "all" && { status: { in: statuses } }),
    ...(mandateTypes && {
      politician: {
        mandates: { some: { type: { in: mandateTypes } } },
      },
    }),
    ...(partiSlug && {
      OR: [
        { partyAtTime: { slug: partiSlug } },
        { politician: { currentParty: { slug: partiSlug } } },
      ],
    }),
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
    affairs,
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
  >`
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
      AND a."publicationStatus" = 'PUBLISHED'
      AND a.involvement IN ('DIRECT','INDIRECT')
    ${
      mandateTypes
        ? Prisma.sql`WHERE EXISTS (SELECT 1 FROM "Mandate" m WHERE m."politicianId" = p.id AND m.type = ANY(${mandateTypes}::"MandateType"[]))`
        : Prisma.empty
    }
    GROUP BY pt.id, pt.slug, pt."shortName", pt.name
    HAVING COUNT(DISTINCT p.id) >= 3
        OR COUNT(DISTINCT CASE WHEN a.status = 'CONDAMNATION_DEFINITIVE' THEN a."politicianId" END) >= 1
    ORDER BY "nCondamnesDefinitifs" DESC, "nSuivis" DESC
  `;

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
