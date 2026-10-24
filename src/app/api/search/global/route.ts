import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma";
import { withCache } from "@/lib/cache";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { parsePagination } from "@/lib/api/pagination";
import { getPublicFactCheckSqlWhere, getPublicPartySqlWhere } from "@/lib/api/public-contract";
import { getPublishedAffairSqlWhere } from "@/lib/affairs/public-filters";
import { normalizeDossierAlias } from "@/lib/legislation/alias";
import { DEPARTMENTS, getDepartmentName, getDepartmentSlug } from "@/config/departments";

const MAX_LIMIT = 8;
/** Department matches are few and come first in Territoires: two leave room for the communes. */
const MAX_DEPARTEMENTS = 2;
const POSTAL_CODE = /^\d{5}$/;

function foldName(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Departments whose code equals the query ("2A", "75") or whose name starts with it. No DB. */
function matchDepartements(query: string, limit: number) {
  const code = query.trim().toUpperCase();
  const folded = foldName(query);
  if (!folded) return [];
  return Object.entries(DEPARTMENTS)
    .filter(([c, d]) => c === code || foldName(d.name).startsWith(folded))
    .slice(0, Math.min(limit, MAX_DEPARTEMENTS))
    .map(([c, d]) => ({ code: c, name: d.name, slug: getDepartmentSlug(d.name) }));
}

// Raw result types from $queryRaw
interface RawPolitician {
  id: string;
  slug: string;
  fullName: string;
  photoUrl: string | null;
  blobPhotoUrl: string | null;
  partyShortName: string | null;
  partyColor: string | null;
  mandateType: string | null;
}

interface RawParty {
  slug: string;
  name: string;
  shortName: string;
  color: string | null;
  memberCount: bigint;
}

interface RawAffair {
  slug: string;
  title: string;
  status: string;
  involvement: string;
  politicianName: string;
  politicianSlug: string;
}

interface RawScrutin {
  id: string;
  slug: string | null;
  title: string;
  votingDate: Date;
  chamber: string;
}

interface RawFactCheck {
  slug: string | null;
  title: string;
  source: string;
  verdictRating: string;
  publishedAt: Date;
  politicianName: string | null;
}

interface RawDossier {
  slug: string;
  title: string;
  shortTitle: string | null;
  status: string;
  filingDate: Date | null;
  aliasLabel: string | null;
}

interface RawCommune {
  id: string;
  name: string;
  departmentCode: string;
  population: number | null;
}

export const GET = withPublicRoute(async (request) => {
  const query = request.nextUrl.searchParams.get("q") || "";
  const { limit } = parsePagination(request.nextUrl.searchParams, {
    defaultLimit: MAX_LIMIT,
    maxLimit: MAX_LIMIT,
  });

  if (query.length < 2) {
    return NextResponse.json({
      politicians: [],
      parties: [],
      affairs: [],
      scrutins: [],
      factchecks: [],
      dossiers: [],
      communes: [],
      departements: [],
    });
  }

  const pattern = `%${query}%`;
  const startsWithPattern = `${query}%`;
  const normalizedQuery = normalizeDossierAlias(query);
  // A postal code also finds the communes it serves, several of them in rural areas.
  const postalCodeClause = POSTAL_CODE.test(query.trim())
    ? Prisma.sql`OR ${query.trim()} = ANY(c."postalCodes")`
    : Prisma.empty;

  const [politicians, parties, affairs, scrutins, factchecks, dossiers, communes] =
    await Promise.all([
      // Politicians: accent-insensitive on fullName/lastName/firstName
      db.$queryRaw<RawPolitician[]>`
        SELECT p."id", p."slug", p."fullName", p."photoUrl", p."blobPhotoUrl",
               party."shortName" AS "partyShortName",
               party."color" AS "partyColor",
               (SELECT m."type" FROM "Mandate" m
                WHERE m."politicianId" = p."id" AND m."isCurrent" = true
                LIMIT 1) AS "mandateType"
        FROM "Politician" p
        LEFT JOIN "Party" party ON party."id" = p."currentPartyId"
        WHERE p."publicationStatus" = 'PUBLISHED'
          AND (unaccent(p."fullName") ILIKE unaccent(${pattern})
            OR unaccent(p."lastName") ILIKE unaccent(${startsWithPattern})
            OR unaccent(p."firstName") ILIKE unaccent(${startsWithPattern}))
        ORDER BY p."prominenceScore" DESC NULLS LAST, p."lastName" ASC
        LIMIT ${limit}
      `,

      // Parties: accent-insensitive on name/shortName; public member count only.
      db.$queryRaw<RawParty[]>(Prisma.sql`
        SELECT p."slug", p."name", p."shortName", p."color",
               (SELECT COUNT(*) FROM "Politician" pol
                WHERE pol."currentPartyId" = p."id"
                  AND pol."publicationStatus" = 'PUBLISHED')::bigint AS "memberCount"
        FROM "Party" p
        WHERE ${getPublicPartySqlWhere()}
          AND (unaccent(p."name") ILIKE unaccent(${pattern})
            OR unaccent(p."shortName") ILIKE unaccent(${Prisma.sql`${query}`}))
        ORDER BY p."name" ASC
        LIMIT ${limit}
      `),

      // Affairs: public affairs tied to public politicians only.
      db.$queryRaw<RawAffair[]>`
        SELECT a."slug", a."title", a."status", a."involvement",
               pol."fullName" AS "politicianName",
               pol."slug" AS "politicianSlug"
        FROM "Affair" a
        JOIN "Politician" pol ON pol."id" = a."politicianId"
        WHERE ${getPublishedAffairSqlWhere()}
          AND pol."publicationStatus" = 'PUBLISHED'
          AND unaccent(a."title") ILIKE unaccent(${pattern})
        ORDER BY a."createdAt" DESC
        LIMIT ${limit}
      `,

      // Scrutins: accent-insensitive on title
      db.$queryRaw<RawScrutin[]>`
        SELECT s."id", s."slug", s."title", s."votingDate", s."chamber"
        FROM "Scrutin" s
        WHERE unaccent(s."title") ILIKE unaccent(${pattern})
        ORDER BY s."votingDate" DESC, s."sequence" DESC
        LIMIT ${limit}
      `,

      // Fact-checks: preserve accent-insensitive search while composing the
      // canonical public publication + allow-list predicate.
      db.$queryRaw<RawFactCheck[]>(Prisma.sql`
        SELECT fc."slug", fc."title", fc."source", fc."verdictRating", fc."publishedAt",
               (SELECT p."fullName"
                FROM "FactCheckMention" m
                JOIN "Politician" p ON p."id" = m."politicianId"
                WHERE m."factCheckId" = fc."id"
                  AND p."publicationStatus" = 'PUBLISHED'
                LIMIT 1) AS "politicianName"
        FROM "FactCheck" fc
        WHERE ${getPublicFactCheckSqlWhere()}
          AND unaccent(fc."title") ILIKE unaccent(${pattern})
        ORDER BY fc."publishedAt" DESC
        LIMIT ${limit}
      `),

      // Aliases are public only after editorial publication. Keep the legal
      // title and the alias in the result so the UI can explain the match.
      db.$queryRaw<RawDossier[]>`
        SELECT d."slug", d."title", d."shortTitle", d."status", d."filingDate",
               (SELECT a."label" FROM "LegislativeDossierAlias" a
                WHERE a."dossierId" = d."id" AND a."status" = 'PUBLISHED'
                  AND a."normalizedLabel" = ${normalizedQuery}
                ORDER BY a."isPreferred" DESC, a."label" ASC LIMIT 1) AS "aliasLabel"
        FROM "LegislativeDossier" d
        WHERE unaccent(d."title") ILIKE unaccent(${pattern})
           OR unaccent(COALESCE(d."shortTitle", '')) ILIKE unaccent(${pattern})
           OR EXISTS (SELECT 1 FROM "LegislativeDossierAlias" a
                     WHERE a."dossierId" = d."id" AND a."status" = 'PUBLISHED'
                       AND a."normalizedLabel" = ${normalizedQuery})
        ORDER BY d."filingDate" DESC NULLS LAST
        LIMIT ${limit}
      `,

      // Communes: accent-insensitive, startsWith for more relevant results
      db.$queryRaw<RawCommune[]>`
        SELECT c."id", c."name", c."departmentCode", c."population"
        FROM "Commune" c
        WHERE unaccent(c."name") ILIKE unaccent(${startsWithPattern})
          ${postalCodeClause}
        ORDER BY c."population" DESC NULLS LAST
        LIMIT ${limit}
      `,
    ]);

  return withCache(
    NextResponse.json({
      politicians: politicians.map((p) => ({
        id: p.id,
        slug: p.slug,
        fullName: p.fullName,
        photoUrl: p.photoUrl,
        blobPhotoUrl: p.blobPhotoUrl,
        party: p.partyShortName,
        partyColor: p.partyColor,
        mandate: p.mandateType,
      })),
      parties: parties.map((p) => ({
        slug: p.slug,
        name: p.name,
        shortName: p.shortName,
        color: p.color,
        memberCount: Number(p.memberCount),
      })),
      affairs: affairs.map((a) => ({
        slug: a.slug,
        title: a.title,
        status: a.status,
        involvement: a.involvement,
        politicianName: a.politicianName,
        politicianSlug: a.politicianSlug,
      })),
      scrutins: scrutins.map((s) => ({
        slug: s.slug,
        id: s.id,
        title: s.title,
        votingDate: s.votingDate.toISOString(),
        chamber: s.chamber,
      })),
      factchecks: factchecks.map((fc) => ({
        slug: fc.slug,
        title: fc.title,
        source: fc.source,
        verdictRating: fc.verdictRating,
        publishedAt: fc.publishedAt.toISOString(),
        politicianName: fc.politicianName,
      })),
      dossiers: dossiers.map((d) => ({
        slug: d.slug,
        title: d.title,
        shortTitle: d.shortTitle,
        aliasLabel: d.aliasLabel,
        status: d.status,
        filingDate: d.filingDate?.toISOString() || null,
      })),
      communes: communes.map((c) => ({
        id: c.id,
        name: c.name,
        departmentName: getDepartmentName(c.departmentCode) ?? c.departmentCode,
        population: c.population,
      })),
      departements: matchDepartements(query, limit),
    }),
    // Free-text results must reflect editorial publication changes immediately. A cached empty
    // response otherwise keeps a newly published person invisible until the CDN entry expires.
    "none"
  );
});
