import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withCache } from "@/lib/cache";
import { withPublicRoute } from "@/lib/api/with-public-route";
import {
  PUBLIC_POLITICIAN_PUBLICATION_STATUS,
  PUBLIC_POLITICIAN_WHERE,
} from "@/lib/api/public-contract";

/**
 * @openapi
 * /api/elections/{slug}:
 *   get:
 *     summary: Détail d'une élection
 *     description: Retourne les informations détaillées d'une élection avec ses candidatures et tours. Les liens vers une fiche politique ne sont exposés que si cette fiche est publiée.
 *     tags: [Élections]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Slug de l'élection (ex. "municipales-2026")
 *     responses:
 *       200:
 *         description: Détail de l'élection
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ElectionDetails'
 *       404:
 *         description: Élection non trouvée
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

  const election = await db.election.findUnique({
    where: { slug },
    include: {
      candidacies: {
        select: {
          id: true,
          candidateName: true,
          partyLabel: true,
          constituencyName: true,
          isElected: true,
          round1Votes: true,
          round1Pct: true,
          round2Votes: true,
          round2Pct: true,
          politician: {
            select: {
              id: true,
              slug: true,
              fullName: true,
              photoUrl: true,
              publicationStatus: true,
            },
          },
          party: {
            select: {
              id: true,
              slug: true,
              shortName: true,
              color: true,
              _count: {
                select: { politicians: { where: PUBLIC_POLITICIAN_WHERE } },
              },
            },
          },
        },
        orderBy: [{ isElected: "desc" }, { round1Pct: "desc" }],
      },
      rounds: {
        select: {
          round: true,
          date: true,
          registeredVoters: true,
          actualVoters: true,
          participationRate: true,
          blankVotes: true,
          nullVotes: true,
        },
        orderBy: { round: "asc" },
      },
    },
  });

  if (!election) {
    return NextResponse.json({ error: "Élection non trouvée" }, { status: 404 });
  }

  return withCache(
    NextResponse.json({
      ...election,
      candidacies: election.candidacies.map((candidacy) => ({
        ...candidacy,
        politician:
          candidacy.politician?.publicationStatus === PUBLIC_POLITICIAN_PUBLICATION_STATUS
            ? {
                id: candidacy.politician.id,
                slug: candidacy.politician.slug,
                fullName: candidacy.politician.fullName,
                photoUrl: candidacy.politician.photoUrl,
              }
            : null,
        party:
          candidacy.party && candidacy.party._count.politicians > 0
            ? {
                id: candidacy.party.id,
                slug: candidacy.party.slug,
                shortName: candidacy.party.shortName,
                color: candidacy.party.color,
              }
            : null,
      })),
    }),
    "daily"
  );
});
