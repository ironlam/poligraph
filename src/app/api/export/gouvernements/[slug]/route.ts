import { NextResponse } from "next/server";
import { createCSVResponse, toCSV } from "@/lib/csv";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { withCache } from "@/lib/cache";
import { EXPORT_CACHE_TAGS, EXPORT_ROLLUP_TAG } from "@/lib/api/export-cache-tags";
import { getGovernmentEpisodesFor, getPublishedGovernments } from "@/lib/data/governments";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { consultableRange } from "@/lib/governments/composition";
import { COMPOSITION_COLUMNS, compositionRows } from "@/lib/governments/export";
import { parseCompositionDate } from "@/lib/governments/params";

export const dynamic = "force-dynamic";

/**
 * @openapi
 * /api/export/gouvernements/{slug}:
 *   get:
 *     summary: Export CSV de la composition d'un gouvernement à une date
 *     description: >
 *       Fonctions du gouvernement au jour `date` (défaut : dernière date consultable), avec leur
 *       catégorie (établie, affaires courantes, transition, à préciser). 404 si le gouvernement
 *       n'est pas publié.
 *     tags: [Exports]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Fichier CSV UTF-8 avec BOM
 *       404:
 *         description: Gouvernement inconnu ou non publié, ou rubrique désactivée
 *       429:
 *         description: Trop de requêtes
 */
export const GET = withPublicRoute(async (request, context) => {
  const notFound = () => NextResponse.json({ error: "Introuvable" }, { status: 404 });
  if (!(await isFeatureEnabled("gouvernements"))) return notFound();

  const { slug } = await context.params;
  const govs = await getPublishedGovernments();
  const gov = govs.find((g) => g.slug === slug);
  if (!gov) return notFound();

  // Same default as the page: an invalid or missing date falls back to the last consultable day.
  const date =
    parseCompositionDate(request.nextUrl.searchParams.get("date") ?? undefined) ??
    consultableRange(gov)?.to ??
    null;

  const data = date ? await getGovernmentEpisodesFor(gov.id) : null;
  const rows = data && date ? compositionRows(gov, data.episodes, data.people, date) : [];
  const csv = toCSV(rows, COMPOSITION_COLUMNS, { neutralizeFormulas: true });
  const filename = `membres-gouvernement-${gov.slug}-${date ?? new Date().toISOString().split("T")[0]}.csv`;

  return withCache(createCSVResponse(csv, filename), "export", [
    EXPORT_CACHE_TAGS.governments,
    EXPORT_ROLLUP_TAG,
  ]);
});
