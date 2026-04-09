import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { FactCheckRating } from "@/generated/prisma";
import { withCache } from "@/lib/cache";
import { FACTCHECK_ALLOWED_SOURCES } from "@/config/labels";
import { parsePagination, buildPaginationMeta } from "@/lib/api/pagination";
import { withPublicRoute } from "@/lib/api/with-public-route";

/**
 * @openapi
 * /api/factchecks:
 *   get:
 *     summary: Liste des fact-checks
 *     description: Retourne la liste paginée des fact-checks avec filtres
 *     tags: [Fact-checks]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Recherche dans le titre ou la déclaration vérifiée
 *       - in: query
 *         name: politician
 *         schema:
 *           type: string
 *         description: Filtrer par slug du politicien
 *       - in: query
 *         name: source
 *         schema:
 *           type: string
 *         description: "Filtrer par source (ex: AFP Factuel, Les Décodeurs)"
 *       - in: query
 *         name: verdict
 *         schema:
 *           type: string
 *           enum: [TRUE, MOSTLY_TRUE, HALF_TRUE, MISLEADING, OUT_OF_CONTEXT, MOSTLY_FALSE, FALSE, UNVERIFIABLE]
 *         description: Filtrer par verdict normalisé
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
 *         description: Liste des fact-checks avec pagination
 *       500:
 *         description: Erreur serveur
 */
export const GET = withPublicRoute(async (request) => {
  const { searchParams } = new URL(request.url);

  const search = searchParams.get("search");
  const politician = searchParams.get("politician");
  const source = searchParams.get("source");
  const verdict = searchParams.get("verdict");
  const { page, limit, skip } = parsePagination(searchParams, { defaultLimit: 20 });

  const where: Record<string, unknown> = {
    source: source || { in: FACTCHECK_ALLOWED_SOURCES },
  };

  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { claimText: { contains: search, mode: "insensitive" } },
    ];
  }

  if (politician) {
    where.mentions = {
      some: {
        politician: { slug: politician },
      },
    };
  }

  if (verdict && Object.values(FactCheckRating).includes(verdict as FactCheckRating)) {
    where.verdictRating = verdict as FactCheckRating;
  }

  const [factchecks, total] = await Promise.all([
    db.factCheck.findMany({
      where,
      select: {
        id: true,
        slug: true,
        claimText: true,
        claimant: true,
        title: true,
        verdict: true,
        verdictRating: true,
        source: true,
        sourceUrl: true,
        publishedAt: true,
        claimDate: true,
        mentions: {
          select: {
            politician: {
              select: {
                id: true,
                slug: true,
                fullName: true,
                currentParty: {
                  select: { shortName: true, name: true },
                },
              },
            },
          },
        },
      },
      orderBy: { publishedAt: "desc" },
      skip,
      take: limit,
    }),
    db.factCheck.count({ where }),
  ]);

  return withCache(
    NextResponse.json({
      data: factchecks.map((fc) => ({
        ...fc,
        politicians: fc.mentions.map((m) => m.politician),
        mentions: undefined,
      })),
      pagination: buildPaginationMeta(page, limit, total),
    }),
    "daily"
  );
});
