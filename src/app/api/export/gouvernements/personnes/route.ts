import { NextResponse } from "next/server";
import { createCSVResponse, toCSV } from "@/lib/csv";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { withCache } from "@/lib/cache";
import { EXPORT_CACHE_TAGS, EXPORT_ROLLUP_TAG } from "@/lib/api/export-cache-tags";
import { getGovernmentEpisodes, getPublishedGovernments } from "@/lib/data/governments";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { SITE_URL } from "@/config/site";
import { filteredMembers, PERSON_COLUMNS, personRows } from "@/lib/governments/export";

export const dynamic = "force-dynamic";

/**
 * @openapi
 * /api/export/gouvernements/personnes:
 *   get:
 *     summary: Export CSV des membres des gouvernements, une ligne par personne
 *     description: >
 *       Mêmes paramètres que la page /politiques/gouvernements/membres (mode, du, au,
 *       gouvernement, fonction, q). Les fiches cachées n'apparaissent pas ; une fiche non
 *       publiée apparaît sans url_profil.
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

  const [govs, data] = await Promise.all([getPublishedGovernments(), getGovernmentEpisodes()]);
  const govById = new Map(govs.map((g) => [g.id, g]));
  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const found = filteredMembers(govs, data, raw);

  // The detail link is the functions export narrowed to one person (search on the slug) and
  // otherwise carrying the same filters.
  const detailUrl = (slug: string): string => {
    const params = new URLSearchParams(request.nextUrl.searchParams);
    params.set("q", slug);
    params.delete("page");
    return `${SITE_URL}/api/export/gouvernements/fonctions?${params.toString()}`;
  };

  const rows = found ? personRows(found.rows, govById, (p) => detailUrl(p.slug)) : [];
  const csv = toCSV(rows, PERSON_COLUMNS, { neutralizeFormulas: true });
  const filename = `membres-gouvernements-personnes-${new Date().toISOString().split("T")[0]}.csv`;

  return withCache(createCSVResponse(csv, filename), "export", [
    EXPORT_CACHE_TAGS.governments,
    EXPORT_ROLLUP_TAG,
  ]);
});
