import { createCommunesRoute } from "../../communes-route";

/**
 * @openapi
 * /api/elections/municipales-2020/communes:
 *   get:
 *     summary: Recherche de communes pour les municipales 2020
 *     description: >
 *       Trois modes de recherche :
 *       - `q` : recherche textuelle sur le nom ou code postal (min 2 chars, max 8 résultats)
 *       - `lat` + `lon` : géolocalisation inversée via geo.api.gouv.fr
 *       - `dept` : filtre par code département
 *     tags: [Municipales 2020]
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
 *         description: Élection municipales-2020 introuvable
 */
export const GET = createCommunesRoute({
  slug: "municipales-2020",
  listCounting: "distinct-names",
});
