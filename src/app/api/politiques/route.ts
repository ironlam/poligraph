import { NextResponse } from "next/server";
import { MandateType } from "@/generated/prisma";
import { getPoliticians } from "@/services/politicians";
import { withCache } from "@/lib/cache";
import { parsePagination } from "@/lib/api/pagination";
import { withPublicRoute } from "@/lib/api/with-public-route";

const VALID_MANDATE_TYPES = Object.values(MandateType) as string[];

/**
 * @openapi
 * /api/politiques:
 *   get:
 *     summary: Liste des représentants politiques
 *     description: Retourne la liste paginée des représentants politiques publiés
 *     tags: [Politiques]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Recherche par nom
 *       - in: query
 *         name: partyId
 *         schema:
 *           type: string
 *         description: Filtrer par ID de parti politique
 *       - in: query
 *         name: mandateType
 *         schema:
 *           type: string
 *           enum: [DEPUTE, SENATEUR, DEPUTE_EUROPEEN, PRESIDENT_REPUBLIQUE, PREMIER_MINISTRE, MINISTRE, MINISTRE_DELEGUE, SECRETAIRE_ETAT, MAIRE, ADJOINT_MAIRE, PRESIDENT_REGION, VICE_PRESIDENT_REGION, PRESIDENT_DEPARTEMENT, VICE_PRESIDENT_DEPARTEMENT, CONSEILLER_REGIONAL, CONSEILLER_DEPARTEMENTAL, CONSEILLER_MUNICIPAL, PRESIDENT_PARTI, OTHER]
 *         description: Filtrer par type de mandat actuel
 *       - in: query
 *         name: hasAffairs
 *         schema:
 *           type: boolean
 *         description: Filtrer les politiques avec/sans affaires judiciaires publiées
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: ["PUBLISHED"]
 *         description: Paramètre conservé pour compatibilité ; seule la valeur PUBLISHED est publique
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: ["name", "prominence"]
 *           default: "name"
 *         description: Tri des résultats
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
 *         description: Liste des représentants politiques avec pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Politician'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       400:
 *         description: Filtre invalide ou tentative d'accès à un statut non public
 *       500:
 *         description: Erreur serveur
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const GET = withPublicRoute(async (request) => {
  const { searchParams } = new URL(request.url);

  const search = searchParams.get("search") || undefined;
  const partyIdParam = searchParams.get("partyId");
  const mandateTypeParam = searchParams.get("mandateType");
  if (partyIdParam !== null && partyIdParam.length === 0) {
    return NextResponse.json({ error: "Parti invalide" }, { status: 400 });
  }
  if (mandateTypeParam !== null && !VALID_MANDATE_TYPES.includes(mandateTypeParam)) {
    return NextResponse.json({ error: "Type de mandat invalide" }, { status: 400 });
  }
  const partyId = partyIdParam ?? undefined;
  const validMandateType = mandateTypeParam as MandateType | null;

  const hasAffairsParam = searchParams.get("hasAffairs");
  if (hasAffairsParam !== null && hasAffairsParam !== "true" && hasAffairsParam !== "false") {
    return NextResponse.json({ error: "Filtre hasAffairs invalide" }, { status: 400 });
  }
  const hasAffairs =
    hasAffairsParam === "true" ? true : hasAffairsParam === "false" ? false : undefined;

  const statusParam = searchParams.get("status");
  if (statusParam !== null && statusParam !== "PUBLISHED") {
    return NextResponse.json(
      { error: "Seuls les représentants publiés sont accessibles" },
      { status: 400 }
    );
  }

  const sort = searchParams.get("sort");
  if (sort !== null && sort !== "name" && sort !== "prominence") {
    return NextResponse.json({ error: "Tri invalide" }, { status: 400 });
  }
  const { page, limit } = parsePagination(searchParams, { defaultLimit: 20 });

  const result = await getPoliticians({
    search,
    partyId,
    mandateType: validMandateType ?? undefined,
    hasAffairs,
    publicationStatus: "PUBLISHED",
    ...(sort === "prominence" && { sortBy: "prominence" as const }),
    page,
    limit,
  });

  return withCache(
    NextResponse.json({
      data: result.data.map((p) => ({
        id: p.id,
        slug: p.slug,
        fullName: p.fullName,
        firstName: p.firstName,
        lastName: p.lastName,
        civility: p.civility,
        birthDate: p.birthDate,
        deathDate: p.deathDate,
        birthPlace: p.birthPlace,
        photoUrl: p.photoUrl,
        currentParty: p.currentParty
          ? {
              id: p.currentParty.id,
              name: p.currentParty.name,
              shortName: p.currentParty.shortName,
              color: p.currentParty.color,
            }
          : null,
      })),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    }),
    "daily"
  );
});
