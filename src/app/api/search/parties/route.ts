import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { PUBLIC_PARTY_WHERE, PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";

/**
 * @openapi
 * /api/search/parties:
 *   get:
 *     summary: Recherche de partis politiques
 *     description: Recherche par nom ou sigle avec autocomplétion (retourne max 8 résultats)
 *     tags: [Recherche]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *         description: Terme de recherche (minimum 2 caractères)
 *         example: "LFI"
 *       - in: query
 *         name: active
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *           default: "true"
 *         description: Filtrer aux partis non dissous
 *     responses:
 *       200:
 *         description: Résultats de recherche
 */
export const GET = withPublicRoute(async (request) => {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q") || "";
  const activeOnly = searchParams.get("active") !== "false";

  if (query.length < 2) {
    return NextResponse.json([]);
  }

  const nameConditions = [
    { name: { contains: query, mode: "insensitive" as const } },
    { shortName: { contains: query, mode: "insensitive" as const } },
  ];

  const parties = await db.party.findMany({
    where: {
      ...PUBLIC_PARTY_WHERE,
      AND: [{ OR: nameConditions }, ...(activeOnly ? [{ dissolvedDate: null }] : [])],
    },
    select: {
      id: true,
      name: true,
      shortName: true,
      slug: true,
      color: true,
      logoUrl: true,
      _count: {
        select: {
          politicians: { where: PUBLIC_POLITICIAN_WHERE },
        },
      },
    },
    orderBy: [{ politicians: { _count: "desc" } }, { name: "asc" }],
    take: 8,
  });

  const results = parties.map((p) => ({
    id: p.id,
    name: p.name,
    shortName: p.shortName,
    slug: p.slug,
    color: p.color,
    logoUrl: p.logoUrl,
    memberCount: p._count.politicians,
  }));

  return NextResponse.json(results);
});
