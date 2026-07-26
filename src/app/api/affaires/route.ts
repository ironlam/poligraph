import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AffairStatus, AffairCategory, Involvement } from "@/generated/prisma";
import { withCache } from "@/lib/cache";
import { parsePagination, buildPaginationMeta } from "@/lib/api/pagination";
import { withPublicRoute } from "@/lib/api/with-public-route";

/**
 * @openapi
 * /api/affaires:
 *   get:
 *     summary: Liste des affaires judiciaires
 *     description: Retourne la liste paginée des affaires judiciaires documentées avec leurs sources
 *     tags: [Affaires]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ENQUETE_PRELIMINAIRE, MISE_EN_EXAMEN, PROCES_EN_COURS, CONDAMNATION_PREMIERE_INSTANCE, APPEL_EN_COURS, POURVOI_EN_CASSATION, CONDAMNATION_DEFINITIVE, RELAXE, NON_LIEU, PRESCRIPTION]
 *         description: Filtrer par statut judiciaire
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [CORRUPTION, FRAUDE_FISCALE, BLANCHIMENT, TRAFIC_INFLUENCE, PRISE_ILLEGALE_INTERET, VIOLENCE, HARCELEMENT_SEXUEL, DIFFAMATION]
 *         description: Filtrer par catégorie d'infraction
 *       - in: query
 *         name: involvement
 *         schema:
 *           type: string
 *           default: DIRECT
 *         description: Filtrer par niveau d'implication (valeurs séparées par virgule). Défaut DIRECT.
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
 *         description: Liste des affaires avec pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Affair'
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

  const status = searchParams.get("status");
  const category = searchParams.get("category");
  const involvement = searchParams.get("involvement");
  const { page, limit, skip } = parsePagination(searchParams, { defaultLimit: 20 });

  const VALID_INVOLVEMENTS: Involvement[] = [
    "DIRECT",
    "INDIRECT",
    "MENTIONED_ONLY",
    "VICTIM",
    "PLAINTIFF",
  ];
  const requestedInvolvements: Involvement[] = involvement
    ? (involvement
        .split(",")
        .filter((v) => VALID_INVOLVEMENTS.includes(v as Involvement)) as Involvement[])
    : ["DIRECT"];

  const validStatus =
    status && Object.values(AffairStatus).includes(status as AffairStatus)
      ? (status as AffairStatus)
      : undefined;
  const validCategory =
    category && Object.values(AffairCategory).includes(category as AffairCategory)
      ? (category as AffairCategory)
      : undefined;

  const where = {
    publicationStatus: "PUBLISHED" as const,
    involvement: { in: requestedInvolvements },
    ...(validStatus && { status: validStatus }),
    ...(validCategory && { category: validCategory }),
  };

  const [affairs, total] = await Promise.all([
    db.affair.findMany({
      where,
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        status: true,
        category: true,
        factsDate: true,
        startDate: true,
        verdictDate: true,
        sentence: true,
        appeal: true,
        createdAt: true,
        updatedAt: true,
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
        partyAtTime: {
          select: { shortName: true, name: true },
        },
        sources: {
          select: {
            id: true,
            url: true,
            title: true,
            publisher: true,
            publishedAt: true,
            sourceType: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    db.affair.count({ where }),
  ]);

  return withCache(
    NextResponse.json({
      data: affairs,
      pagination: buildPaginationMeta(page, limit, total),
    }),
    "daily"
  );
});
