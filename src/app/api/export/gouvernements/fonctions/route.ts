import { NextResponse } from "next/server";
import { createCSVResponse, toCSV } from "@/lib/csv";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { withCache } from "@/lib/cache";
import { EXPORT_CACHE_TAGS, EXPORT_ROLLUP_TAG } from "@/lib/api/export-cache-tags";
import { getGovernmentEpisodes, getPublishedGovernments } from "@/lib/data/governments";
import { getGovernmentMemberAffairs } from "@/lib/data/government-affairs";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { filteredMembers, FUNCTION_COLUMNS, functionRows } from "@/lib/governments/export";

export const dynamic = "force-dynamic";

/**
 * @openapi
 * /api/export/gouvernements/fonctions:
 *   get:
 *     summary: Export CSV des fonctions gouvernementales, une ligne par fonction
 *     description: >
 *       Mêmes paramètres que la page /politiques/gouvernements/membres. Chaque date porte sa
 *       preuve, son mode de détermination et l'acte qui la justifie.
 *     tags: [Exports]
 *     responses:
 *       200:
 *         description: Fichier CSV UTF-8 avec BOM
 *       404:
 *         description: Rubrique désactivée
 *       429:
 *         description: Trop de requêtes
 */
export const GET = withPublicRoute(async (request) => {
  if (!(await isFeatureEnabled("gouvernements"))) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }

  const [govs, data, affairs] = await Promise.all([
    getPublishedGovernments(),
    getGovernmentEpisodes(),
    getGovernmentMemberAffairs(),
  ]);
  const govById = new Map(govs.map((g) => [g.id, g]));
  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const found = filteredMembers(govs, data, raw, affairs);

  const rows = found ? functionRows(found.rows, govById) : [];
  const csv = toCSV(rows, FUNCTION_COLUMNS, { neutralizeFormulas: true });
  const filename = `membres-gouvernements-fonctions-${new Date().toISOString().split("T")[0]}.csv`;

  return withCache(createCSVResponse(csv, filename), "export", [
    EXPORT_CACHE_TAGS.governments,
    EXPORT_ROLLUP_TAG,
  ]);
});
