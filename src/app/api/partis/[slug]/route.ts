import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withCache } from "@/lib/cache";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { PUBLIC_PARTY_WHERE, PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";
import { getPublishedAffairWhere } from "@/lib/affairs/public-filters";

/**
 * @openapi
 * /api/partis/{slug}:
 *   get:
 *     summary: Détail d'un parti politique
 *     description: Retourne les informations détaillées d'un parti avec ses membres publiés, identifiants externes et filiation
 *     tags: [Partis]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Slug du parti (ex. "les-republicains")
 *     responses:
 *       200:
 *         description: Détail du parti avec membres publiés et historique de direction public
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/PartyDetails'
 *                 - type: object
 *                   properties:
 *                     leadership:
 *                       type: array
 *                       description: Historique des dirigeants publiés du parti (actuel et passés)
 *                       items:
 *                         type: object
 *                         properties:
 *                           politicianId:
 *                             type: string
 *                           politicianSlug:
 *                             type: string
 *                           politicianName:
 *                             type: string
 *                           politicianPhoto:
 *                             type: string
 *                             nullable: true
 *                           title:
 *                             type: string
 *                           startDate:
 *                             type: string
 *                             format: date-time
 *                           endDate:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *                           isCurrent:
 *                             type: boolean
 *       404:
 *         description: Parti non trouvé
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Erreur serveur
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const GET = withPublicRoute(async (_request, context) => {
  const { slug } = await context.params;

  const party = await db.party.findFirst({
    where: { slug, ...PUBLIC_PARTY_WHERE },
    include: {
      politicians: {
        where: PUBLIC_POLITICIAN_WHERE,
        select: {
          id: true,
          slug: true,
          fullName: true,
          photoUrl: true,
          mandates: {
            where: { isCurrent: true },
            select: { type: true, title: true },
            take: 1,
          },
          _count: { select: { affairs: { where: getPublishedAffairWhere() } } },
        },
      },
      externalIds: {
        select: { source: true, externalId: true, url: true },
      },
      predecessor: {
        select: {
          id: true,
          slug: true,
          name: true,
          shortName: true,
          _count: {
            select: { politicians: { where: PUBLIC_POLITICIAN_WHERE } },
          },
        },
      },
      successors: {
        where: PUBLIC_PARTY_WHERE,
        select: { id: true, slug: true, name: true, shortName: true },
      },
    },
  });

  if (!party) {
    return NextResponse.json({ error: "Parti non trouvé" }, { status: 404 });
  }

  // Fetch leadership history, but never expose an unpublished politician through
  // an otherwise public party endpoint.
  const leadership = await db.mandate.findMany({
    where: {
      type: "PRESIDENT_PARTI",
      partyId: party.id,
      politician: { publicationStatus: "PUBLISHED" },
    },
    select: {
      id: true,
      title: true,
      startDate: true,
      endDate: true,
      isCurrent: true,
      politician: {
        select: { id: true, slug: true, fullName: true, photoUrl: true },
      },
    },
    orderBy: { startDate: "desc" },
  });

  const { politicians, predecessor, ...rest } = party;

  const members = politicians.map(({ mandates, _count, ...p }) => ({
    ...p,
    currentMandate: mandates[0] ? { type: mandates[0].type, title: mandates[0].title } : null,
    affairsCount: _count.affairs,
  }));

  return withCache(
    NextResponse.json({
      ...rest,
      predecessor:
        predecessor && predecessor._count.politicians > 0
          ? {
              id: predecessor.id,
              slug: predecessor.slug,
              name: predecessor.name,
              shortName: predecessor.shortName,
            }
          : null,
      memberCount: members.length,
      members,
      leadership: leadership.map((m) => ({
        politicianId: m.politician.id,
        politicianSlug: m.politician.slug,
        politicianName: m.politician.fullName,
        politicianPhoto: m.politician.photoUrl,
        title: m.title,
        startDate: m.startDate,
        endDate: m.endDate,
        isCurrent: m.isCurrent,
      })),
    }),
    "daily"
  );
});
