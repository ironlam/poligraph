import { cacheTag, cacheLife } from "next/cache";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma";

// ─── PPL Stats types ─────────────────────────────────

export interface TopAuthor {
  slug: string;
  fullName: string;
  photoUrl: string | null;
  blobPhotoUrl: string | null;
  partyShortName: string | null;
  partyColor: string | null;
  count: number;
}

export interface TopParty {
  slug: string;
  shortName: string;
  name: string;
  color: string | null;
  count: number;
}

export interface TopDossier {
  slug: string;
  title: string;
  shortTitle: string | null;
  status: string;
  authorCount: number;
}

export interface PPLStats {
  topAuthors: TopAuthor[];
  topParties: TopParty[];
  topDossiers: TopDossier[];
}

// ─── Latest Dossiers (for hub) ───────────────────────

export async function getLatestDossiers(limit = 6) {
  "use cache";
  cacheTag("legislation");
  cacheLife("synced");

  return db.legislativeDossier.findMany({
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      externalId: true,
      slug: true,
      title: true,
      shortTitle: true,
      number: true,
      status: true,
      category: true,
      theme: true,
      summary: true,
      filingDate: true,
      adoptionDate: true,
      _count: { select: { amendments: true } },
    },
  });
}

// ─── Queries ─────────────────────────────────────────

export async function getPPLStats(): Promise<PPLStats> {
  "use cache";
  cacheTag("legislation");
  cacheLife("synced");
  const [topAuthors, topParties, topDossiers] = await Promise.all([
    db.$queryRaw<TopAuthor[]>(Prisma.sql`
      SELECT
        p.slug,
        p."fullName",
        p."photoUrl",
        pa."shortName" AS "partyShortName",
        pa.color AS "partyColor",
        COUNT(*)::int AS count
      FROM "DossierAuthor" da
      JOIN "Politician" p ON p.id = da."politicianId"
      LEFT JOIN "Party" pa ON pa.id = p."currentPartyId"
      WHERE da.role IN ('AUTEUR', 'COSIGNATAIRE') OR da.role IS NULL
      GROUP BY p.id, p.slug, p."fullName", p."photoUrl", pa."shortName", pa.color
      ORDER BY count DESC
      LIMIT 10
    `),

    db.$queryRaw<TopParty[]>(Prisma.sql`
      SELECT
        pa.slug,
        pa."shortName",
        pa.name,
        pa.color,
        COUNT(*)::int AS count
      FROM "DossierAuthor" da
      JOIN "Politician" p ON p.id = da."politicianId"
      JOIN "Party" pa ON pa.id = p."currentPartyId"
      WHERE da.role IN ('AUTEUR', 'COSIGNATAIRE') OR da.role IS NULL
      GROUP BY pa.id, pa.slug, pa."shortName", pa.name, pa.color
      ORDER BY count DESC
      LIMIT 10
    `),

    db.$queryRaw<TopDossier[]>(Prisma.sql`
      SELECT
        d.slug,
        d.title,
        d."shortTitle",
        d.status,
        COUNT(da.id)::int AS "authorCount"
      FROM "LegislativeDossier" d
      JOIN "DossierAuthor" da ON da."dossierId" = d.id
      WHERE da.role IN ('AUTEUR', 'COSIGNATAIRE') OR da.role IS NULL
      GROUP BY d.id, d.slug, d.title, d."shortTitle", d.status
      ORDER BY "authorCount" DESC
      LIMIT 5
    `),
  ]);

  return { topAuthors, topParties, topDossiers };
}
