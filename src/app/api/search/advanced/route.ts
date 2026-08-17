import { NextRequest, NextResponse } from "next/server";
import { searchPoliticians, SearchFilters } from "@/services/search";
import { MandateType } from "@/generated/prisma";
import { withCache } from "@/lib/cache";
import { parsePagination } from "@/lib/api/pagination";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { findDepartmentCode } from "@/config/departments";

/**
 * @openapi
 * /api/search/advanced:
 *   get:
 *     summary: Recherche avancée de représentants publiés
 *     description: Recherche avec filtres multiples (parti, mandat, département, affaires publiées) sur le corpus public
 *     tags: [Recherche]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *           minLength: 2
 *         description: Terme de recherche (nom, prénom)
 *         example: "dupont"
 *       - in: query
 *         name: party
 *         schema:
 *           type: string
 *         description: ID du parti politique
 *       - in: query
 *         name: mandate
 *         schema:
 *           type: string
 *           enum: [DEPUTE, SENATEUR, DEPUTE_EUROPEEN, PRESIDENT_REPUBLIQUE, PREMIER_MINISTRE, MINISTRE, MINISTRE_DELEGUE, SECRETAIRE_ETAT, PRESIDENT_REGION, VICE_PRESIDENT_REGION, PRESIDENT_DEPARTEMENT, VICE_PRESIDENT_DEPARTEMENT, MAIRE, ADJOINT_MAIRE, CONSEILLER_REGIONAL, CONSEILLER_DEPARTEMENTAL, CONSEILLER_MUNICIPAL, PRESIDENT_PARTI, OTHER]
 *         description: Type de mandat actuel
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *         description: Nom du département
 *         example: "Paris"
 *       - in: query
 *         name: hasAffairs
 *         schema:
 *           type: boolean
 *         description: Filtrer par présence d'affaires judiciaires publiées
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filtrer par statut actif (mandat en cours)
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
 *         description: Nombre de résultats par page
 *     responses:
 *       200:
 *         description: Résultats de recherche avec pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       slug:
 *                         type: string
 *                       fullName:
 *                         type: string
 *                       photoUrl:
 *                         type: string
 *                         nullable: true
 *                       currentParty:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           shortName:
 *                             type: string
 *                           color:
 *                             type: string
 *                       currentMandate:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           type:
 *                             type: string
 *                           constituency:
 *                             type: string
 *                       affairsCount:
 *                         type: integer
 *                         description: Nombre d'affaires publiées, tous rôles confondus (compatibilité legacy)
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *                 suggestions:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: Suggestions si aucun résultat
 *       400:
 *         description: Filtre invalide
 *       500:
 *         description: Erreur serveur
 */
export const GET = withPublicRoute(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);

  const query = searchParams.get("q") || "";
  const partyParam = searchParams.get("party");
  const mandateParam = searchParams.get("mandate");
  const departmentParam = searchParams.get("department");
  const hasAffairsParam = searchParams.get("hasAffairs");
  const isActiveParam = searchParams.get("isActive");
  const { page, limit } = parsePagination(searchParams, { defaultLimit: 20 });

  if (partyParam !== null && partyParam.length === 0) {
    return NextResponse.json({ error: "Parti invalide" }, { status: 400 });
  }
  if (mandateParam !== null && !Object.values(MandateType).includes(mandateParam as MandateType)) {
    return NextResponse.json({ error: "Type de mandat invalide" }, { status: 400 });
  }
  if (
    departmentParam !== null &&
    (departmentParam.length === 0 || !findDepartmentCode(departmentParam))
  ) {
    return NextResponse.json({ error: "Département invalide" }, { status: 400 });
  }
  if (hasAffairsParam !== null && hasAffairsParam !== "true" && hasAffairsParam !== "false") {
    return NextResponse.json({ error: "Filtre hasAffairs invalide" }, { status: 400 });
  }
  if (isActiveParam !== null && isActiveParam !== "true" && isActiveParam !== "false") {
    return NextResponse.json({ error: "Filtre isActive invalide" }, { status: 400 });
  }

  const hasAffairs =
    hasAffairsParam === "true" ? true : hasAffairsParam === "false" ? false : undefined;
  const isActive = isActiveParam === "true" ? true : isActiveParam === "false" ? false : undefined;
  const partyId = partyParam ?? undefined;
  const department = departmentParam ?? undefined;

  const filters: SearchFilters = {
    query,
    partyId,
    mandateType: (mandateParam as MandateType | null) ?? undefined,
    department,
    hasAffairs,
    isActive,
  };

  const results = await searchPoliticians(filters, page, limit);
  return withCache(NextResponse.json(results), "daily");
});

/**
 * @openapi
 * /api/search/advanced/filters:
 *   get:
 *     summary: Options de filtres de recherche
 *     description: Retourne les options disponibles pour les filtres (partis, départements, types de mandat) sur le corpus public
 *     tags: [Recherche]
 *     responses:
 *       200:
 *         description: Options de filtres
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 parties:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       shortName:
 *                         type: string
 *                       name:
 *                         type: string
 *                       color:
 *                         type: string
 *                       count:
 *                         type: integer
 *                 departments:
 *                   type: array
 *                   items:
 *                     type: string
 *                 mandateTypes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                       count:
 *                         type: integer
 */
