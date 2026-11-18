import { NextResponse } from "next/server";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { withCache } from "@/lib/cache";
import { suggestCommunesInDepartement } from "@/lib/data/territoires";
import { territoireCommunePath } from "@/lib/territoires/paths";

/**
 * @openapi
 * /api/search/communes:
 *   get:
 *     summary: Suggestions de communes dans un département
 *     description: Communes d'un département dont le nom contient le texte saisi (8 résultats au plus). Un texte de cinq chiffres est lu comme un code postal.
 *     tags: [Recherche]
 *     parameters:
 *       - in: query
 *         name: departement
 *         required: true
 *         schema:
 *           type: string
 *         description: Code du département
 *         example: "29"
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 80
 *         description: Début ou partie du nom de la commune, ou code postal
 *         example: "quim"
 *     responses:
 *       200:
 *         description: Communes correspondantes, la plus proche du texte d'abord
 */
export const GET = withPublicRoute(async (request) => {
  const params = request.nextUrl.searchParams;
  // The reader validates both values: an unknown department or a short text gives no row.
  const communes = await suggestCommunesInDepartement(
    params.get("departement") ?? "",
    params.get("q") ?? ""
  );
  // Free text: the response cannot be invalidated by tag, so it is not cached.
  return withCache(
    NextResponse.json(
      communes.map((commune) => ({
        code: commune.inseeCode,
        name: commune.name,
        postalCodes: commune.postalCodes,
        population: commune.population,
        href: territoireCommunePath(commune.inseeCode, commune.name),
      }))
    ),
    "none"
  );
});
