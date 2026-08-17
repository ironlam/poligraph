import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withCache } from "@/lib/cache";
import { getPoliticianVotingStats } from "@/services/voteStats";
import { parsePagination, buildPaginationMeta } from "@/lib/api/pagination";
import { withPublicRoute } from "@/lib/api/with-public-route";

/**
 * @openapi
 * /api/politiques/{slug}/votes:
 *   get:
 *     summary: Votes d'un représentant publié
 *     description: Retourne l'historique des votes parlementaires d'un représentant publié avec statistiques. Un taux de participation nullable doit être interprété avec participationStatus.
 *     tags: [Votes]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Slug du représentant
 *         example: jean-luc-melenchon
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
 *         description: Votes du représentant avec statistiques
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 politician:
 *                   $ref: '#/components/schemas/PoliticianSummary'
 *                 stats:
 *                   $ref: '#/components/schemas/VoteStats'
 *                 votes:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Vote'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       404:
 *         description: Représentant non trouvé ou non publié
 *       500:
 *         description: Erreur serveur
 */
export const GET = withPublicRoute(async (request, context) => {
  const { slug } = await context.params;
  const { searchParams } = new URL(request.url);

  const { page, limit, skip } = parsePagination(searchParams, { defaultLimit: 20 });

  const politician = await db.politician.findFirst({
    where: { slug, publicationStatus: "PUBLISHED" },
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
    },
  });

  if (!politician) {
    return NextResponse.json({ error: "Représentant non trouvé ou non publié" }, { status: 404 });
  }

  const [votes, total, votingStats] = await Promise.all([
    db.vote.findMany({
      where: { politicianId: politician.id },
      include: {
        scrutin: {
          select: {
            id: true,
            externalId: true,
            title: true,
            votingDate: true,
            legislature: true,
            votesFor: true,
            votesAgainst: true,
            votesAbstain: true,
            result: true,
            sourceUrl: true,
          },
        },
      },
      orderBy: { votingDate: "desc" },
      skip,
      take: limit,
    }),
    db.vote.count({
      where: { politicianId: politician.id },
    }),
    getPoliticianVotingStats(politician.id),
  ]);

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
      stats: votingStats,
      votes: votes.map((v) => ({
        id: v.id,
        position: v.position,
        scrutin: v.scrutin,
      })),
      pagination: buildPaginationMeta(page, limit, total),
    }),
    "daily"
  );
});
