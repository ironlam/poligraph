import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ElectionType, ElectionStatus } from "@/generated/prisma";
import { withCache } from "@/lib/cache";
import { parsePagination, buildPaginationMeta } from "@/lib/api/pagination";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { pickEnumValue } from "@/lib/data/enum-guards";

/**
 * @openapi
 * /api/elections:
 *   get:
 *     summary: Liste des élections
 *     description: Retourne la liste paginée des élections avec filtres optionnels
 *     tags: [Élections]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [PRESIDENTIELLE, LEGISLATIVES, SENATORIALES, MUNICIPALES, DEPARTEMENTALES, REGIONALES, EUROPEENNES, REFERENDUM]
 *         description: Filtrer par type d'élection
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [UPCOMING, REGISTRATION, CANDIDACIES, CAMPAIGN, ROUND_1, BETWEEN_ROUNDS, ROUND_2, COMPLETED]
 *         description: Filtrer par statut
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: Filtrer par année du premier tour
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
 *         description: Liste des élections avec pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ElectionSummary'
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

  const type = searchParams.get("type");
  const status = searchParams.get("status");
  const yearStr = searchParams.get("year");
  const { page, limit, skip } = parsePagination(searchParams, { defaultLimit: 20 });

  const year = yearStr ? parseInt(yearStr, 10) : null;

  // An out-of-enum ?type=/?status= is dropped rather than cast: Prisma answers
  // a bad enum with a validation error, i.e. an unhandled 500 on a public route.
  const safeType = pickEnumValue(type, ElectionType);
  const safeStatus = pickEnumValue(status, ElectionStatus);

  const where = {
    ...(safeType && { type: safeType }),
    ...(safeStatus && { status: safeStatus }),
    ...(year && {
      round1Date: {
        gte: new Date(year, 0, 1),
        lt: new Date(year + 1, 0, 1),
      },
    }),
  };

  const [elections, total] = await Promise.all([
    db.election.findMany({
      where,
      select: {
        id: true,
        slug: true,
        type: true,
        title: true,
        shortTitle: true,
        status: true,
        scope: true,
        suffrage: true,
        round1Date: true,
        round2Date: true,
        dateConfirmed: true,
        totalSeats: true,
        _count: { select: { candidacies: true } },
      },
      orderBy: { round1Date: "desc" },
      skip,
      take: limit,
    }),
    db.election.count({ where }),
  ]);

  const data = elections.map(({ _count, ...election }) => ({
    ...election,
    candidacyCount: _count.candidacies,
  }));

  return withCache(
    NextResponse.json({
      data,
      pagination: buildPaginationMeta(page, limit, total),
    }),
    "daily"
  );
});
