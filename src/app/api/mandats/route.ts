import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { MandateType } from "@/generated/prisma";
import { withCache } from "@/lib/cache";
import { parsePagination, buildPaginationMeta } from "@/lib/api/pagination";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { getMandateStartDatePublicationStatus } from "@/lib/api/public-contract";

/**
 * @openapi
 * /api/mandats:
 *   get:
 *     summary: Liste des mandats politiques
 *     description: Retourne la liste paginée des mandats de personnalités publiées avec filtres optionnels
 *     tags: [Mandats]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [DEPUTE, SENATEUR, DEPUTE_EUROPEEN, PRESIDENT_REPUBLIQUE, PREMIER_MINISTRE, MINISTRE, SECRETAIRE_ETAT, MINISTRE_DELEGUE, PRESIDENT_REGION, VICE_PRESIDENT_REGION, PRESIDENT_DEPARTEMENT, VICE_PRESIDENT_DEPARTEMENT, MAIRE, ADJOINT_MAIRE, CONSEILLER_REGIONAL, CONSEILLER_DEPARTEMENTAL, CONSEILLER_MUNICIPAL, PRESIDENT_PARTI, OTHER]
 *         description: Filtrer par type de mandat
 *       - in: query
 *         name: isCurrent
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *         description: Filtrer par mandats actifs ou terminés
 *       - in: query
 *         name: politicianId
 *         schema:
 *           type: string
 *         description: Filtrer par identifiant d'un politicien publié
 *       - in: query
 *         name: institution
 *         schema:
 *           type: string
 *         description: Recherche sur l'institution (insensible à la casse)
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
 *         description: Liste des mandats avec pagination. Chaque mandat contient startDatePublicationStatus (AVAILABLE ou UNVERIFIED).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MandateSummary'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       400:
 *         description: Filtre invalide, notamment paramètre structuré présent mais vide
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
  const isCurrent = searchParams.get("isCurrent");
  const politicianId = searchParams.get("politicianId");
  const institution = searchParams.get("institution");
  const { page, limit, skip } = parsePagination(searchParams, { defaultLimit: 20 });

  const mandateTypes = Object.values(MandateType) as string[];
  if (type !== null && !mandateTypes.includes(type)) {
    return NextResponse.json({ error: "Type de mandat invalide" }, { status: 400 });
  }
  if (isCurrent !== null && isCurrent !== "true" && isCurrent !== "false") {
    return NextResponse.json({ error: "Filtre isCurrent invalide" }, { status: 400 });
  }
  if (politicianId !== null && politicianId.length === 0) {
    return NextResponse.json({ error: "Politicien invalide" }, { status: 400 });
  }
  if (institution !== null && institution.length === 0) {
    return NextResponse.json({ error: "Institution invalide" }, { status: 400 });
  }

  const validType = type as MandateType | null;

  const where = {
    politician: { publicationStatus: "PUBLISHED" as const },
    ...(validType && { type: validType }),
    ...(isCurrent !== null && { isCurrent: isCurrent === "true" }),
    ...(politicianId !== null && { politicianId }),
    ...(institution !== null && {
      institution: { contains: institution, mode: "insensitive" as const },
    }),
  };

  const [mandates, total] = await Promise.all([
    db.mandate.findMany({
      where,
      select: {
        id: true,
        type: true,
        title: true,
        institution: true,
        role: true,
        constituency: true,
        departmentCode: true,
        startDate: true,
        endDate: true,
        isCurrent: true,
        politician: {
          select: {
            id: true,
            slug: true,
            fullName: true,
            photoUrl: true,
          },
        },
      },
      orderBy: { startDate: "desc" },
      skip,
      take: limit,
    }),
    db.mandate.count({ where }),
  ]);

  return withCache(
    NextResponse.json({
      data: mandates.map((mandate) => ({
        ...mandate,
        startDatePublicationStatus: getMandateStartDatePublicationStatus(mandate.type),
      })),
      pagination: buildPaginationMeta(page, limit, total),
    }),
    "daily"
  );
});
