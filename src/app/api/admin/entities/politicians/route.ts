import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { MANDATE_TYPE_LABELS } from "@/config/labels";

const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  id: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(20).default(20),
});

const politicianSelect = {
  id: true,
  fullName: true,
  slug: true,
  publicationStatus: true,
  currentParty: { select: { shortName: true, name: true } },
  mandates: {
    where: { isCurrent: true },
    orderBy: { startDate: "desc" as const },
    take: 1,
    select: { type: true, title: true, institution: true, constituency: true },
  },
} as const;

function formatResult(politician: {
  id: string;
  fullName: string;
  slug: string;
  publicationStatus: string;
  currentParty: { shortName: string | null; name: string } | null;
  mandates: Array<{
    type: keyof typeof MANDATE_TYPE_LABELS;
    title: string;
    institution: string;
    constituency: string | null;
  }>;
}) {
  return {
    id: politician.id,
    fullName: politician.fullName,
    slug: politician.slug,
    publicationStatus: politician.publicationStatus,
    party: politician.currentParty,
    mandate: politician.mandates[0] ?? null,
  };
}

export const GET = withAdminAuth(async (request: NextRequest) => {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success)
    return NextResponse.json({ error: "Paramètres de recherche invalides" }, { status: 400 });
  const { q, id, page, limit } = parsed.data;

  if (id) {
    const politician = await db.politician.findUnique({ where: { id }, select: politicianSelect });
    return NextResponse.json({ result: politician ? formatResult(politician) : null });
  }
  if (!q || q.length < 2) return NextResponse.json({ results: [], page, limit, hasMore: false });

  const offset = (page - 1) * limit;
  const search = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT p.id
    FROM "Politician" p
    LEFT JOIN "Party" party ON party.id = p."currentPartyId"
    WHERE lower(unaccent(concat_ws(' ', p."firstName", p."lastName", p."fullName", p.slug,
      coalesce(p."normalizedLastName", ''), coalesce(party.name, ''), coalesce(party."shortName", ''))))
      LIKE lower(unaccent(${search})) ESCAPE '\\'
    ORDER BY p."prominenceScore" DESC, p."lastName" ASC, p."firstName" ASC
    OFFSET ${offset}
    LIMIT ${limit + 1}
  `);
  const hasMore = rows.length > limit;
  const ids = rows.slice(0, limit).map((row) => row.id);
  if (!ids.length) return NextResponse.json({ results: [], page, limit, hasMore: false });

  const politicians = await db.politician.findMany({
    where: { id: { in: ids } },
    select: politicianSelect,
  });
  const byId = new Map(politicians.map((politician) => [politician.id, politician]));
  return NextResponse.json({
    results: ids.flatMap((politicianId) => {
      const politician = byId.get(politicianId);
      return politician ? [formatResult(politician)] : [];
    }),
    page,
    limit,
    hasMore,
  });
});
