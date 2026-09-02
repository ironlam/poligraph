import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withCache } from "@/lib/cache";
import { parsePagination, buildPaginationMeta } from "@/lib/api/pagination";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { parseIntFilter } from "@/lib/data/query-params";

/**
 * @openapi
 * /api/votes:
 *   get:
 *     summary: Liste des scrutins parlementaires
 *     description: Retourne la liste paginée des scrutins publics (votes nominatifs)
 *     tags: [Votes]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Recherche dans le titre du scrutin
 *       - in: query
 *         name: result
 *         schema:
 *           type: string
 *           enum: [ADOPTED, REJECTED]
 *         description: Filtrer par résultat (adopté ou rejeté)
 *       - in: query
 *         name: legislature
 *         schema:
 *           type: integer
 *           example: 16
 *         description: Filtrer par législature
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
 *         description: Liste des scrutins avec pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Scrutin'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
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
  const result = searchParams.get("result");
  const legislature = searchParams.get("legislature");
  const { page, limit, skip } = parsePagination(searchParams, { defaultLimit: 20 });

  const ALLOWED_RESULTS = ["ADOPTED", "REJECTED"] as const;
  const validResult =
    result && (ALLOWED_RESULTS as readonly string[]).includes(result)
      ? (result as (typeof ALLOWED_RESULTS)[number])
      : undefined;

  // `parseInt("abc")` is NaN, and a NaN in a `where` makes Prisma throw rather
  // than match nothing, so an unparseable legislature drops the filter.
  const safeLegislature = parseIntFilter(legislature);

  const where = {
    ...(search && {
      title: { contains: search, mode: "insensitive" as const },
    }),
    ...(validResult && { result: validResult }),
    ...(safeLegislature !== undefined && { legislature: safeLegislature }),
  };

  const [scrutins, total] = await Promise.all([
    db.scrutin.findMany({
      where,
      select: {
        id: true,
        externalId: true,
        title: true,
        votingDate: true,
        legislature: true,
        votesFor: true,
        votesAgainst: true,
        votesAbstain: true,
        result: true,
        sourceUrl: true,
        _count: {
          select: { votes: true },
        },
      },
      orderBy: { votingDate: "desc" },
      skip,
      take: limit,
    }),
    db.scrutin.count({ where }),
  ]);

  return withCache(
    NextResponse.json({
      data: scrutins.map((s) => ({
        ...s,
        totalVotes: s._count.votes,
        _count: undefined,
      })),
      pagination: buildPaginationMeta(page, limit, total),
    }),
    "daily"
  );
});
