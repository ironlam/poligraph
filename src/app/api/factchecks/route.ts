import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { FactCheckRating, Prisma } from "@/generated/prisma";
import { withCache } from "@/lib/cache";
import { parsePagination, buildPaginationMeta } from "@/lib/api/pagination";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { getPublicFactCheckWhere, isAllowedFactCheckSource } from "@/lib/api/public-contract";

/**
 * @openapi
 * /api/factchecks:
 *   get:
 *     summary: Liste des fact-checks
 *     description: Retourne la liste paginée des fact-checks publiés issus des sources autorisées
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
 *         description: Filtrer par slug d'un politicien publié
 *       - in: query
 *         name: source
 *         schema:
 *           type: string
 *         description: Filtrer par une source publique autorisée
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
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Liste des fact-checks avec pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/FactCheck'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       400:
 *         description: Filtre invalide
 *       500:
 *         description: Erreur serveur
 */
export const GET = withPublicRoute(async (request) => {
  const { searchParams } = new URL(request.url);

  const search = searchParams.get("search");
  const politician = searchParams.get("politician");
  const source = searchParams.get("source");
  const verdict = searchParams.get("verdict");
  const { page, limit, skip } = parsePagination(searchParams, {
    defaultLimit: 20,
  });

  if (politician !== null && politician.length === 0) {
    return NextResponse.json({ error: "Politicien invalide" }, { status: 400 });
  }
  if (source !== null && !isAllowedFactCheckSource(source)) {
    return NextResponse.json({ error: "Source de fact-check non autorisée" }, { status: 400 });
  }

  if (verdict !== null && !Object.values(FactCheckRating).includes(verdict as FactCheckRating)) {
    return NextResponse.json({ error: "Verdict invalide" }, { status: 400 });
  }

  const where: Prisma.FactCheckWhereInput = {
    ...getPublicFactCheckWhere(source ?? undefined),
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
        politician: { slug: politician, publicationStatus: "PUBLISHED" },
      },
    };
  }

  if (verdict !== null) {
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
          where: { politician: { publicationStatus: "PUBLISHED" } },
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
