import { NextResponse } from "next/server";
import { parseStrictPagination } from "@/lib/api/pagination";
import { withCache } from "@/lib/cache";
import { withPublicRoute } from "@/lib/api/with-public-route";
import {
  ELECTION_CANDIDACIES_DEFAULT_LIMIT,
  ELECTION_CANDIDACIES_MAX_LIMIT,
  getPublicElectionDetails,
} from "@/lib/data/election-details";

/**
 * @openapi
 * /api/elections/{slug}:
 *   get:
 *     summary: Détail d'une élection
 *     description: Retourne les informations détaillées d'une élection, une page bornée de candidatures et ses tours. Les liens vers une fiche politique ne sont exposés que si cette fiche est publiée.
 *     tags: [Élections]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Slug de l'élection (ex. "municipales-2026")
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page de candidatures
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Nombre de candidatures par page
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
  if (!slug) {
    return NextResponse.json({ error: "Slug d'élection invalide" }, { status: 400 });
  }
  const pagination = parseStrictPagination(_request.nextUrl.searchParams, {
    defaultLimit: ELECTION_CANDIDACIES_DEFAULT_LIMIT,
    maxLimit: ELECTION_CANDIDACIES_MAX_LIMIT,
  });

  if (pagination === null) {
    return NextResponse.json({ error: "Pagination invalide" }, { status: 400 });
  }

  const election = await getPublicElectionDetails(slug, pagination);

  if (!election) {
    return NextResponse.json({ error: "Élection non trouvée" }, { status: 404 });
  }

  return withCache(NextResponse.json(election), "daily");
});
