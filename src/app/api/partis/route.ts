import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PoliticalPosition, Prisma } from "@/generated/prisma";
import { withCache } from "@/lib/cache";
import { parsePagination, buildPaginationMeta } from "@/lib/api/pagination";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { PUBLIC_PARTY_WHERE, PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";

/**
 * @openapi
 * /api/partis:
 *   get:
 *     summary: Liste des partis politiques
 *     description: Retourne la liste paginée des partis politiques avec filtres optionnels et compte uniquement les membres publiés
 *     tags: [Partis]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Recherche sur le nom ou l'abréviation (insensible à la casse)
 *       - in: query
 *         name: position
 *         schema:
 *           type: string
 *           enum: [FAR_LEFT, LEFT, CENTER_LEFT, CENTER, CENTER_RIGHT, RIGHT, FAR_RIGHT]
 *         description: Filtrer par position sur l'échiquier politique
 *       - in: query
 *         name: active
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *         description: "true = non dissous avec au moins un membre publié, false = dissous"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *         description: Numéro de page
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *           maximum: 100
 *         description: Nombre d'éléments par page
 *     responses:
 *       200:
 *         description: Liste des partis avec pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Party'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       400:
 *         description: Filtre invalide
 *       500:
 *         description: Erreur serveur
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const GET = withPublicRoute(async (request) => {
  const { searchParams } = new URL(request.url);

  const search = searchParams.get("search");
  const position = searchParams.get("position");
  const active = searchParams.get("active");
  const { page, limit, skip } = parsePagination(searchParams, { defaultLimit: 20 });

  if (
    position !== null &&
    !Object.values(PoliticalPosition).includes(position as PoliticalPosition)
  ) {
    return NextResponse.json({ error: "Position politique invalide" }, { status: 400 });
  }
  if (active !== null && active !== "true" && active !== "false") {
    return NextResponse.json({ error: "Filtre active invalide" }, { status: 400 });
  }

  const where: Prisma.PartyWhereInput = {
    ...PUBLIC_PARTY_WHERE,
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { shortName: { contains: search, mode: "insensitive" as const } },
      ],
    }),
    ...(position !== null && { politicalPosition: position as PoliticalPosition }),
    ...(active === "true" && { dissolvedDate: null }),
    ...(active === "false" && { dissolvedDate: { not: null } }),
  };

  const [parties, total] = await Promise.all([
    db.party.findMany({
      where,
      select: {
        id: true,
        slug: true,
        name: true,
        shortName: true,
        color: true,
        politicalPosition: true,
        politicalPositionSource: true,
        politicalPositionSourceUrl: true,
        logoUrl: true,
        foundedDate: true,
        dissolvedDate: true,
        website: true,
        _count: {
          select: {
            politicians: { where: PUBLIC_POLITICIAN_WHERE },
          },
        },
      },
      orderBy: { name: "asc" },
      skip,
      take: limit,
    }),
    db.party.count({ where }),
  ]);

  const data = parties.map(({ _count, ...party }) => ({
    ...party,
    memberCount: _count.politicians,
  }));

  return withCache(
    NextResponse.json({
      data,
      pagination: buildPaginationMeta(page, limit, total),
    }),
    "daily"
  );
});
