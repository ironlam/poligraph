import { cacheTag, cacheLife } from "next/cache";
import { MandateType } from "@/generated/prisma";
import { db } from "@/lib/db";
import { getDepartmentName } from "@/config/departments";
import { LOCAL_MANDATE_TYPES } from "@/config/labels";

// ─── Types ───────────────────────────────────────────────────────

export interface EluSummary {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  gender: string | null;
  birthDate: string | null;
  role: string; // MandateType value
  isCurrent: boolean;
  mandateStart: string | null;
  functionStart: string | null;
  commune: {
    inseeCode: string;
    name: string;
    departmentCode: string;
    departmentName: string;
    population: number | null;
  } | null;
  party: {
    shortName: string;
    color: string | null;
    slug: string | null;
  } | null;
  politician: {
    slug: string;
    fullName: string;
    photoUrl: string | null;
  };
}

export interface EluDetail extends EluSummary {
  mandateEnd: string | null;
  partyLabel: string | null; // From MandateLocal
  source: string; // DataSource
  externalId: string | null; // rneExternalId from MandateLocal
}

// ─── Shared select shapes ────────────────────────────────────────

const COMMUNE_SELECT = {
  id: true,
  name: true,
  departmentCode: true,
  population: true,
} as const;

const PARTY_SELECT = {
  shortName: true,
  color: true,
  slug: true,
} as const;

// ─── Raw type ────────────────────────────────────────────────────

type RawMandate = {
  id: string;
  type: MandateType;
  startDate: Date;
  endDate: Date | null;
  isCurrent: boolean;
  departmentCode: string | null;
  source: string | null;
  politician: {
    id: string;
    slug: string;
    firstName: string;
    lastName: string;
    fullName: string;
    civility: string | null;
    birthDate: Date | null;
    photoUrl: string | null;
    currentParty: { shortName: string; color: string | null; slug: string | null } | null;
  };
  localData: {
    communeId: string | null;
    functionStart: Date | null;
    rneExternalId: string | null;
    partyLabel: string | null;
    commune: {
      id: string;
      name: string;
      departmentCode: string;
      population: number | null;
    } | null;
  } | null;
};

// ─── Transform helpers ───────────────────────────────────────────

function toSummary(m: RawMandate): EluSummary {
  return {
    id: m.politician.id,
    firstName: m.politician.firstName,
    lastName: m.politician.lastName,
    fullName: m.politician.fullName,
    gender: m.politician.civility === "Mme" ? "F" : m.politician.civility === "M." ? "M" : null,
    birthDate: m.politician.birthDate?.toISOString() ?? null,
    role: m.type,
    isCurrent: m.isCurrent,
    mandateStart: m.startDate?.toISOString() ?? null,
    functionStart: m.localData?.functionStart?.toISOString() ?? null,
    commune: m.localData?.commune
      ? {
          inseeCode: m.localData.commune.id,
          name: m.localData.commune.name,
          departmentCode: m.localData.commune.departmentCode,
          departmentName:
            getDepartmentName(m.localData.commune.departmentCode) ??
            m.localData.commune.departmentCode,
          population: m.localData.commune.population,
        }
      : null,
    party: m.politician.currentParty ?? null,
    politician: {
      slug: m.politician.slug,
      fullName: m.politician.fullName,
      photoUrl: m.politician.photoUrl,
    },
  };
}

function toDetail(m: RawMandate): EluDetail {
  return {
    ...toSummary(m),
    mandateEnd: m.endDate?.toISOString() ?? null,
    partyLabel: m.localData?.partyLabel ?? null,
    source: m.source ?? "",
    externalId: m.localData?.rneExternalId ?? null,
  };
}

// ─── Private query ───────────────────────────────────────────────

const VALID_ROLES = new Set<string>(LOCAL_MANDATE_TYPES);

async function queryElus(opts: {
  search?: string;
  departmentCode?: string;
  communeId?: string;
  role?: string;
  partyId?: string;
  gender?: string;
  currentOnly?: boolean;
  page: number;
  limit: number;
}) {
  const {
    search,
    departmentCode,
    communeId,
    role,
    partyId,
    gender,
    currentOnly = true,
    page,
    limit,
  } = opts;
  const skip = (page - 1) * limit;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    type: role && VALID_ROLES.has(role) ? role : { in: LOCAL_MANDATE_TYPES },
    ...(currentOnly ? { isCurrent: true } : {}),
    ...(departmentCode ? { departmentCode } : {}),
    ...(communeId ? { localData: { communeId } } : {}),
    politician: {
      ...(partyId ? { currentPartyId: partyId } : {}),
      ...(gender ? { civility: gender === "F" ? "Mme" : "M." } : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
  };

  const include = {
    politician: {
      select: {
        id: true,
        slug: true,
        firstName: true,
        lastName: true,
        fullName: true,
        civility: true,
        birthDate: true,
        photoUrl: true,
        currentParty: { select: PARTY_SELECT },
      },
    },
    localData: {
      include: { commune: { select: COMMUNE_SELECT } },
    },
  } as const;

  const [mandates, total] = await Promise.all([
    db.mandate.findMany({
      where,
      include,
      orderBy: { politician: { lastName: "asc" } },
      skip,
      take: limit,
    }),
    db.mandate.count({ where }),
  ]);

  return { data: mandates.map(toSummary), total, page, limit };
}

// ─── Cached path (bounded key space) ─────────────────────────────

export async function getElusFiltered(opts: {
  departmentCode?: string;
  communeId?: string;
  role?: string;
  partyId?: string;
  gender?: string;
  page: number;
  limit: number;
}) {
  "use cache";
  cacheTag("elections", "maires-listing");
  cacheLife("synced");
  return queryElus(opts);
}

// ─── Uncached path (free-text search) ────────────────────────────

export async function searchElus(opts: {
  search: string;
  departmentCode?: string;
  communeId?: string;
  role?: string;
  partyId?: string;
  gender?: string;
  page: number;
  limit: number;
}) {
  return queryElus(opts);
}

// ─── Router ──────────────────────────────────────────────────────

export async function getElus(opts: {
  search?: string;
  departmentCode?: string;
  communeId?: string;
  role?: string;
  partyId?: string;
  gender?: string;
  page: number;
  limit: number;
}) {
  if (opts.search) {
    return searchElus({ ...opts, search: opts.search });
  }
  return getElusFiltered(opts);
}

// ─── Single elu by ID ────────────────────────────────────────────

export async function getEluById(id: string) {
  "use cache";
  cacheTag("elections");
  cacheLife("synced");

  // Legacy: id may be a mandate id or a politician id
  const mandate = await db.mandate.findFirst({
    where: {
      OR: [
        { id, type: { in: LOCAL_MANDATE_TYPES } },
        { politicianId: id, type: { in: LOCAL_MANDATE_TYPES } },
      ],
    },
    include: {
      politician: {
        select: {
          id: true,
          slug: true,
          firstName: true,
          lastName: true,
          fullName: true,
          civility: true,
          birthDate: true,
          photoUrl: true,
          currentParty: { select: PARTY_SELECT },
        },
      },
      localData: { include: { commune: { select: COMMUNE_SELECT } } },
    },
  });

  return mandate ? toDetail(mandate) : null;
}

// ─── Commune: info + elected officials ───────────────────────────

export async function getCommuneWithElus(inseeCode: string) {
  "use cache";
  cacheTag("elections");
  cacheLife("synced");

  const commune = await db.commune.findUnique({
    where: { id: inseeCode },
    select: {
      id: true,
      name: true,
      departmentCode: true,
      regionCode: true,
      regionName: true,
      postalCodes: true,
      population: true,
      latitude: true,
      longitude: true,
      totalSeats: true,
      website: true,
    },
  });

  if (!commune) return null;

  const mandates = await db.mandate.findMany({
    where: {
      type: { in: LOCAL_MANDATE_TYPES },
      isCurrent: true,
      localData: { communeId: inseeCode },
    },
    include: {
      politician: {
        select: {
          id: true,
          slug: true,
          firstName: true,
          lastName: true,
          fullName: true,
          civility: true,
          birthDate: true,
          photoUrl: true,
          currentParty: { select: PARTY_SELECT },
        },
      },
      localData: { include: { commune: { select: COMMUNE_SELECT } } },
    },
    orderBy: [{ type: "asc" }, { politician: { lastName: "asc" } }],
  });

  const maire = mandates.find((m) => m.type === "MAIRE");

  return {
    commune: {
      inseeCode: commune.id,
      name: commune.name,
      departmentCode: commune.departmentCode,
      departmentName: getDepartmentName(commune.departmentCode) ?? commune.departmentCode,
      regionCode: commune.regionCode,
      regionName: commune.regionName,
      postalCodes: commune.postalCodes,
      population: commune.population,
      latitude: commune.latitude,
      longitude: commune.longitude,
      totalSeats: commune.totalSeats,
      website: commune.website,
    },
    maire: maire ? toSummary(maire) : null,
    officials: mandates.map(toSummary),
  };
}
