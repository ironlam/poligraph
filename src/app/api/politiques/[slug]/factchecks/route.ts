import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withCache } from "@/lib/cache";
import { parsePagination, buildPaginationMeta } from "@/lib/api/pagination";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { getPublicFactCheckWhere } from "@/lib/api/public-contract";

/**
 * @openapi
 * /api/politiques/{slug}/factchecks:
 *   get:
 *     summary: Fact-checks mentionnant un politicien
 *     description: Retourne les fact-checks publiés et autorisés mentionnant un politicien publié
 *     tags: [Politiques]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
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
 *         description: Fact-checks du politicien avec pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 politician:
 *                   $ref: '#/components/schemas/PoliticianSummary'
 *                 factchecks:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/FactCheck'
 *                 total:
 *                   type: integer
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       404:
 *         description: Politicien non trouvé ou non publié
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
    return NextResponse.json({ error: "Politicien non trouvé ou non publié" }, { status: 404 });
  }

  const mentionWhere = {
    politicianId: politician.id,
    factCheck: getPublicFactCheckWhere(),
  };

  const [mentions, total] = await Promise.all([
    db.factCheckMention.findMany({
      where: mentionWhere,
      select: {
        factCheck: {
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
          },
        },
      },
      orderBy: { factCheck: { publishedAt: "desc" } },
      skip,
      take: limit,
    }),
    db.factCheckMention.count({ where: mentionWhere }),
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
      factchecks: mentions.map((m) => m.factCheck),
      total,
      pagination: buildPaginationMeta(page, limit, total),
    }),
    "daily"
  );
});
