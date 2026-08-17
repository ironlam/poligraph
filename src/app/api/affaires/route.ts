import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AffairStatus, AffairCategory, Involvement } from "@/generated/prisma";
import { withCache } from "@/lib/cache";
import { parsePagination, buildPaginationMeta } from "@/lib/api/pagination";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { getPublicAffairSemantics } from "@/lib/api/public-contract";
import { getPublishedAffairWhere } from "@/lib/affairs/public-filters";
import { PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";

/**
 * @openapi
 * /api/affaires:
 *   get:
 *     summary: Liste des affaires judiciaires
 *     description: Retourne la liste paginée des affaires publiées de personnalités publiées, avec leurs sources, leur rôle et la sémantique éditoriale canonique
 *     tags: [Affaires]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ENQUETE_PRELIMINAIRE, INSTRUCTION, INSTRUCTION_CLOTUREE_SANS_MISE_EN_EXAMEN, MISE_EN_EXAMEN, RENVOI_TRIBUNAL, PROCES_EN_COURS, CONDAMNATION_PREMIERE_INSTANCE, APPEL_EN_COURS, POURVOI_EN_CASSATION, CONDAMNATION_DEFINITIVE, RELAXE, ACQUITTEMENT, NON_LIEU, PRESCRIPTION, CLASSEMENT_SANS_SUITE]
 *         description: Filtrer par statut judiciaire
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [CORRUPTION, CORRUPTION_PASSIVE, TRAFIC_INFLUENCE, PRISE_ILLEGALE_INTERETS, FAVORITISME, DETOURNEMENT_FONDS_PUBLICS, FRAUDE_FISCALE, BLANCHIMENT, ABUS_BIENS_SOCIAUX, ABUS_CONFIANCE, EMPLOI_FICTIF, FINANCEMENT_ILLEGAL_CAMPAGNE, FINANCEMENT_ILLEGAL_PARTI, HARCELEMENT_MORAL, HARCELEMENT_SEXUEL, AGRESSION_SEXUELLE, VIOLENCE, MENACE, DIFFAMATION, INJURE, INCITATION_HAINE, FAUX_ET_USAGE_FAUX, RECEL, CONFLIT_INTERETS, AUTRE]
 *         description: Filtrer par catégorie d'infraction
 *       - in: query
 *         name: involvement
 *         schema:
 *           type: string
 *           default: DIRECT
 *         description: Filtrer par niveau d'implication (valeurs séparées par virgule). Défaut DIRECT. Les segments vides, séparateurs doublés ou finaux sont invalides.
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
 *         description: Liste des affaires avec pagination. Chaque item contient involvement et semantics (libellés, prudence, certitude et maturité judiciaire).
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

  const status = searchParams.get("status");
  const category = searchParams.get("category");
  const involvement = searchParams.get("involvement");
  const { page, limit, skip } = parsePagination(searchParams, { defaultLimit: 20 });

  const validInvolvements = Object.values(Involvement) as string[];
  const involvementValues = involvement !== null ? involvement.split(",") : ["DIRECT"];
  if (involvementValues.some((value) => !validInvolvements.includes(value))) {
    return NextResponse.json({ error: "Niveau d'implication invalide" }, { status: 400 });
  }
  const requestedInvolvements = involvementValues as Involvement[];

  if (status !== null && !Object.values(AffairStatus).includes(status as AffairStatus)) {
    return NextResponse.json({ error: "Statut judiciaire invalide" }, { status: 400 });
  }
  if (category !== null && !Object.values(AffairCategory).includes(category as AffairCategory)) {
    return NextResponse.json({ error: "Catégorie d'affaire invalide" }, { status: 400 });
  }

  const validStatus = status as AffairStatus | null;
  const validCategory = category as AffairCategory | null;

  const where = {
    ...getPublishedAffairWhere(),
    involvement: { in: requestedInvolvements },
    ...(validStatus && { status: validStatus }),
    ...(validCategory && { category: validCategory }),
    politician: PUBLIC_POLITICIAN_WHERE,
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
        involvement: true,
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
          select: {
            shortName: true,
            name: true,
            _count: { select: { politicians: { where: PUBLIC_POLITICIAN_WHERE } } },
          },
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
      data: affairs.map((affair) => {
        const partyAtTime =
          affair.partyAtTime && affair.partyAtTime._count.politicians > 0
            ? { shortName: affair.partyAtTime.shortName, name: affair.partyAtTime.name }
            : null;
        return {
          ...affair,
          partyAtTime,
          semantics: getPublicAffairSemantics(affair),
        };
      }),
      pagination: buildPaginationMeta(page, limit, total),
    }),
    "daily"
  );
});
