import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Involvement } from "@/generated/prisma";
import { withCache } from "@/lib/cache";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { getPublicAffairSemantics, PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";
import { getPublishedAffairWhere } from "@/lib/affairs/public-filters";

/**
 * @openapi
 * /api/politiques/{slug}/affaires:
 *   get:
 *     summary: Affaires d'un représentant publié
 *     description: Retourne les affaires judiciaires publiées d'un représentant publié avec son rôle, les sources et la sémantique éditoriale canonique
 *     tags: [Affaires]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Slug du représentant (ex. nicolas-sarkozy)
 *       - in: query
 *         name: involvement
 *         schema:
 *           type: string
 *           default: DIRECT
 *         description: Filtrer par niveau d'implication (valeurs séparées par virgule). Défaut DIRECT. Une liste vide ou composée uniquement de séparateurs est invalide.
 *     responses:
 *       200:
 *         description: Affaires du représentant. Chaque item contient involvement et semantics afin de distinguer mise en cause, mention, victime et plaignant.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 politician:
 *                   $ref: '#/components/schemas/PoliticianSummary'
 *                 affairs:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Affair'
 *                 total:
 *                   type: integer
 *       400:
 *         description: Filtre invalide, notamment liste vide ou composée uniquement de séparateurs
 *       404:
 *         description: Représentant non trouvé ou non publié
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Erreur serveur
 */
export const GET = withPublicRoute(async (request, context) => {
  const { slug } = await context.params;
  const { searchParams } = new URL(request.url);
  const involvement = searchParams.get("involvement");

  const validInvolvements = Object.values(Involvement) as string[];
  const involvementValues = involvement !== null ? involvement.split(",") : ["DIRECT"];
  if (involvementValues.some((value) => !validInvolvements.includes(value))) {
    return NextResponse.json({ error: "Niveau d'implication invalide" }, { status: 400 });
  }
  const requestedInvolvements = involvementValues as Involvement[];

  const politician = await db.politician.findFirst({
    where: { slug, ...PUBLIC_POLITICIAN_WHERE },
    select: {
      id: true,
      slug: true,
      fullName: true,
      firstName: true,
      lastName: true,
      photoUrl: true,
      currentParty: {
        select: { shortName: true, name: true, color: true },
      },
      affairs: {
        where: {
          ...getPublishedAffairWhere(),
          involvement: { in: requestedInvolvements },
          politician: PUBLIC_POLITICIAN_WHERE,
        },
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
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!politician) {
    return NextResponse.json({ error: "Représentant non trouvé ou non publié" }, { status: 404 });
  }

  return withCache(
    NextResponse.json({
      politician: {
        id: politician.id,
        slug: politician.slug,
        fullName: politician.fullName,
        firstName: politician.firstName,
        lastName: politician.lastName,
        photoUrl: politician.photoUrl,
        party: politician.currentParty,
      },
      affairs: politician.affairs.map((affair) => ({
        ...affair,
        partyAtTime: affair.partyAtTime?._count.politicians
          ? {
              shortName: affair.partyAtTime.shortName,
              name: affair.partyAtTime.name,
            }
          : null,
        semantics: getPublicAffairSemantics(affair),
      })),
      total: politician.affairs.length,
    }),
    "daily"
  );
});
