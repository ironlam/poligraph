import { createCommunesRoute } from "../../communes-route";

/**
 * @openapi
 * /api/elections/municipales-2026/communes:
 *   get:
 *     summary: Recherche de communes pour les municipales 2026
 *     description: >
 *       Trois modes de recherche :
 *       - `q` : recherche textuelle sur le nom ou code postal (min 2 chars, max 8 résultats)
 *       - `lat` + `lon` : géolocalisation inversée via geo.api.gouv.fr
 *       - `dept` : filtre par code département
 *     tags: [Municipales 2026]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *           minLength: 2
 *         description: Terme de recherche (nom de commune ou code postal)
 *       - in: query
 *         name: lat
 *         schema:
 *           type: number
 *         description: Latitude pour géolocalisation inversée
 *       - in: query
 *         name: lon
 *         schema:
 *           type: number
 *         description: Longitude pour géolocalisation inversée
 *       - in: query
 *         name: dept
 *         schema:
 *           type: string
 *         description: Code département (ex. "13", "75", "2A")
 *       - in: query
 *         name: resultats
 *         schema:
 *           type: string
 *           enum: ["1"]
 *         description: Ne garder que les communes ayant un résultat de premier tour
 *     responses:
 *       200:
 *         description: Liste de communes avec statistiques de candidatures
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     description: Code INSEE
 *                   name:
 *                     type: string
 *                   departmentCode:
 *                     type: string
 *                   departmentName:
 *                     type: string
 *                   population:
 *                     type: integer
 *                     nullable: true
 *                   totalSeats:
 *                     type: integer
 *                     nullable: true
 *                   listCount:
 *                     type: integer
 *                   candidateCount:
 *                     type: integer
 *       400:
 *         description: Paramètres invalides
 *       404:
 *         description: Élection municipales-2026 introuvable
 */
export const GET = createCommunesRoute({
  slug: "municipales-2026",
  listCounting: "distinct-names",
  textSearchFilters: true,
});
