import { cacheLife, cacheTag } from "next/cache";
import { Prisma } from "@/generated/prisma";
import { MANDAT_BY_LABEL, MANDAT_GROUPES, type ParrainageMandat } from "@/config/parrainages";
import { isMissingTableError } from "@/lib/data/commune-population";
import { db } from "@/lib/db";
import { generateSlug } from "@/lib/utils";

/**
 * Readers of the presidential presentations. Every reader is bounded, cached under `synced` and
 * tagged `parrainages`. Candidates always come in the same order, by count then by published
 * name, whoever they are. A reader returns rows that exist: none of them states an absence.
 */

/** Rows listed on a department page. The largest department of 2022 holds 259. */
export const DEPARTEMENT_ROWS_LIMIT = 1000;
export const COMMUNE_ROWS_LIMIT = 20;
export const DERNIERES_LIMIT = 10;

export interface ParrainageCandidat {
  /** As published by the Conseil constitutionnel: "NOM Prénom". */
  candidateName: string;
  slug: string;
  total: number;
  /** Departments and collectivities, counted on the published label as the law does. */
  departements: number;
  /** Largest count in one department, to compare with the cap of a tenth. */
  maxParDepartement: number;
  /** Name of the candidacy in base, null when the published candidate has none. */
  candidacyName: string | null;
  /** Published profile of the candidate, when there is one. */
  politicianSlug: string | null;
}

export interface ParrainageLigne {
  id: string;
  civility: string;
  firstName: string;
  lastName: string;
  mandateLabel: string;
  constituencyLabel: string;
  departmentLabel: string;
  departmentCode: string | null;
  communeCode: string | null;
  candidateName: string;
  /** ISO date (yyyy-mm-dd) of the publication. */
  publishedOn: string;
  /** Published profile of the elected official, only when the link was established. */
  politicianSlug: string | null;
}

const LIGNE_SELECT = {
  id: true,
  civility: true,
  firstName: true,
  lastName: true,
  mandateLabel: true,
  constituencyLabel: true,
  departmentLabel: true,
  departmentCode: true,
  communeCode: true,
  candidateName: true,
  publishedOn: true,
  politician: { select: { slug: true, publicationStatus: true } },
} satisfies Prisma.ParrainageSelect;

type LigneRow = Prisma.ParrainageGetPayload<{ select: typeof LIGNE_SELECT }>;

function toLigne({ politician, publishedOn, ...row }: LigneRow): ParrainageLigne {
  return {
    ...row,
    publishedOn: publishedOn.toISOString().slice(0, 10),
    politicianSlug: politician?.publicationStatus === "PUBLISHED" ? politician.slug : null,
  };
}

/** The code can ship before prisma/migrations/manual/2026-11-18-parrainages.sql. */
async function orEmpty<T>(query: Promise<T[]>): Promise<T[]> {
  try {
    return await query;
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

const byCountThenName = <T extends { total: number }>(name: (item: T) => string) => {
  return (a: T, b: T) => b.total - a.total || name(a).localeCompare(name(b), "fr");
};

/** Every candidate with at least one presentation, by count then by published name. */
export async function getParrainagesCandidats(electionSlug: string): Promise<ParrainageCandidat[]> {
  "use cache";
  cacheLife("synced");
  cacheTag("parrainages");

  // One group per candidate and department, whatever the candidacy link: rows imported before a
  // candidacy existed keep a null link, and grouping on it would count their department twice.
  const rows = await orEmpty(
    db.$queryRaw<
      {
        candidateName: string;
        total: number;
        departements: number;
        maxParDepartement: number;
        candidacyName: string | null;
        politicianSlug: string | null;
      }[]
    >(Prisma.sql`
      SELECT t."candidateName", sum(t.n)::int AS "total", count(*)::int AS "departements",
             max(t.n)::int AS "maxParDepartement", max(c."candidateName") AS "candidacyName",
             max(pol."slug") AS "politicianSlug"
      FROM (
        SELECT p."candidateName", p."departmentLabel", max(p."candidacyId") AS "candidacyId",
               count(*) AS n
        FROM "Parrainage" p JOIN "Election" e ON e."id" = p."electionId"
        WHERE e."slug" = ${electionSlug}
        GROUP BY 1, 2
      ) t
      LEFT JOIN "Candidacy" c ON c."id" = t."candidacyId"
      LEFT JOIN "Politician" pol
        ON pol."id" = c."politicianId" AND pol."publicationStatus" = 'PUBLISHED'
      GROUP BY 1
    `)
  );
  return rows
    .map((row) => ({ ...row, slug: generateSlug(row.candidateName) }))
    .sort(byCountThenName((row) => row.candidateName));
}

export interface ParrainagesTableauDeBord {
  total: number;
  candidats: ParrainageCandidat[];
  /** ISO date of the latest publication, null while nothing is published. */
  dernierePublication: string | null;
  /** Departments with at least one resolved presentation, by code. */
  departements: { code: string; total: number }[];
}

export async function getParrainagesTableauDeBord(
  electionSlug: string
): Promise<ParrainagesTableauDeBord> {
  "use cache";
  cacheLife("synced");
  cacheTag("parrainages");

  const where = { election: { slug: electionSlug } };
  const [candidats, last, departements] = await Promise.all([
    getParrainagesCandidats(electionSlug),
    orEmpty(
      db.parrainage.findMany({
        where,
        orderBy: { publishedOn: "desc" },
        take: 1,
        select: { publishedOn: true },
      })
    ),
    orEmpty(
      db.parrainage.groupBy({
        by: ["departmentCode"],
        where: { ...where, departmentCode: { not: null } },
        _count: { _all: true },
        orderBy: { departmentCode: "asc" },
      })
    ),
  ]);
  return {
    total: candidats.reduce((sum, candidat) => sum + candidat.total, 0),
    candidats,
    dernierePublication: last[0]?.publishedOn.toISOString().slice(0, 10) ?? null,
    departements: departements.map((d) => ({ code: d.departmentCode!, total: d._count._all })),
  };
}

export interface ParrainagesCandidatDetail {
  candidat: ParrainageCandidat;
  parDepartement: { label: string; code: string | null; total: number }[];
  parMandat: { mandat: ParrainageMandat; label: string; total: number }[];
  dernieres: ParrainageLigne[];
}

/** Null when no candidate of this election carries this slug. */
export async function getParrainagesCandidat(
  electionSlug: string,
  candidatSlug: string
): Promise<ParrainagesCandidatDetail | null> {
  "use cache";
  cacheLife("synced");
  cacheTag("parrainages");

  const candidat = (await getParrainagesCandidats(electionSlug)).find(
    (item) => item.slug === candidatSlug
  );
  if (!candidat) return null;

  const where = { election: { slug: electionSlug }, candidateName: candidat.candidateName };
  const [departements, mandats, dernieres] = await Promise.all([
    db.parrainage.groupBy({
      by: ["departmentLabel", "departmentCode"],
      where,
      _count: { _all: true },
    }),
    db.parrainage.groupBy({ by: ["mandateLabel"], where, _count: { _all: true } }),
    db.parrainage.findMany({
      where,
      orderBy: [{ publishedOn: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
      take: DERNIERES_LIMIT,
      select: LIGNE_SELECT,
    }),
  ]);

  const parMandat = new Map<ParrainageMandat, number>();
  for (const row of mandats) {
    const mandat = MANDAT_BY_LABEL[row.mandateLabel];
    if (mandat) parMandat.set(mandat, (parMandat.get(mandat) ?? 0) + row._count._all);
  }
  return {
    candidat,
    parDepartement: departements
      .map((d) => ({ label: d.departmentLabel, code: d.departmentCode, total: d._count._all }))
      .sort(byCountThenName((d) => d.label)),
    parMandat: [...parMandat]
      .map(([mandat, total]) => ({ mandat, label: MANDAT_GROUPES[mandat], total }))
      .sort(byCountThenName((m) => m.label)),
    dernieres: dernieres.map(toLigne),
  };
}

export interface ParrainagesDepartement {
  total: number;
  candidats: { candidateName: string; slug: string; total: number }[];
  /** By commune or constituency label, then by name. Capped at DEPARTEMENT_ROWS_LIMIT. */
  lignes: ParrainageLigne[];
}

export async function getParrainagesDepartement(
  electionSlug: string,
  departmentCode: string
): Promise<ParrainagesDepartement> {
  "use cache";
  cacheLife("synced");
  cacheTag("parrainages");

  const where = { election: { slug: electionSlug }, departmentCode };
  const [candidats, lignes] = await Promise.all([
    orEmpty(db.parrainage.groupBy({ by: ["candidateName"], where, _count: { _all: true } })),
    orEmpty(
      db.parrainage.findMany({
        where,
        orderBy: [{ constituencyLabel: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
        take: DEPARTEMENT_ROWS_LIMIT,
        select: LIGNE_SELECT,
      })
    ),
  ]);
  const sorted = candidats
    .map((c) => ({
      candidateName: c.candidateName,
      slug: generateSlug(c.candidateName),
      total: c._count._all,
    }))
    .sort(byCountThenName((c) => c.candidateName));
  return {
    total: sorted.reduce((sum, candidat) => sum + candidat.total, 0),
    candidats: sorted,
    lignes: lignes.map(toLigne),
  };
}

/** Presentations made by the elected officials of one commune. Empty when there is none. */
export async function getParrainagesCommune(
  electionSlug: string,
  communeCode: string
): Promise<ParrainageLigne[]> {
  "use cache";
  cacheLife("synced");
  cacheTag("parrainages");

  const lignes = await orEmpty(
    db.parrainage.findMany({
      where: { election: { slug: electionSlug }, communeCode },
      orderBy: [{ publishedOn: "asc" }, { lastName: "asc" }],
      take: COMMUNE_ROWS_LIMIT,
      select: LIGNE_SELECT,
    })
  );
  return lignes.map(toLigne);
}
