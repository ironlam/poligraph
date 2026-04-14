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
