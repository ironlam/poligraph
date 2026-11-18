import type { Metadata, MetadataRoute } from "next";
import { getDepartmentName, getDepartmentSlug } from "@/config/departments";
import {
  parrainagesCandidatPath,
  parrainagesDepartementPath,
  parrainagesPath,
} from "@/config/parrainages";

const NOINDEX_FOLLOW = { index: false, follow: true } as const;

/**
 * A candidate page of the presidential presentations is indexable from this count. Calibrated on
 * the 2022 list in production (2026-11-18): 12 candidates above 500, 17 above 100, the same 17
 * above 50, 23 above 10. Nobody stands between 50 and 100, so the threshold falls in a real gap;
 * below it a page holds a few dozen lines at most. Re-measure on the first 2027 publications,
 * where every count starts low.
 */
export const PARRAINAGES_CANDIDAT_MIN_PRESENTATIONS = 100;

export function isIndexableParrainagesCandidat(total: number): boolean {
  return total >= PARRAINAGES_CANDIDAT_MIN_PRESENTATIONS;
}

/** `robots` fragment of a candidate page: {} when indexable, noindex,follow below the threshold. */
export function parrainagesCandidatRobotsMetadata(total: number): Pick<Metadata, "robots"> {
  return isIndexableParrainagesCandidat(total) ? {} : { robots: NOINDEX_FOLLOW };
}

/**
 * Sitemap entries of one election: the dashboard, the candidate pages above the threshold and the
 * department pages. `lastModified` is the latest publication by the Conseil constitutionnel, not
 * the render date. Nothing while no presentation is published. No page exists per elected
 * official, so none is listed.
 */
export function parrainagesSitemapEntries(
  siteUrl: string,
  electionSlug: string,
  tableau: {
    dernierePublication: string | null;
    candidats: readonly { slug: string; total: number }[];
    departements: readonly { code: string }[];
  }
): MetadataRoute.Sitemap {
  if (!tableau.dernierePublication || tableau.candidats.length === 0) return [];
  const lastModified = new Date(`${tableau.dernierePublication}T00:00:00Z`);
  const entry = (path: string, priority: number) => ({
    url: `${siteUrl}${path}`,
    lastModified,
    changeFrequency: "weekly" as const,
    priority,
  });
  return [
    entry(parrainagesPath(electionSlug), 0.7),
    ...tableau.candidats
      .filter((candidat) => isIndexableParrainagesCandidat(candidat.total))
      .map((candidat) => entry(parrainagesCandidatPath(electionSlug, candidat.slug), 0.6)),
    ...tableau.departements.flatMap(({ code }) => {
      const name = getDepartmentName(code);
      return name
        ? [entry(parrainagesDepartementPath(electionSlug, getDepartmentSlug(name)), 0.5)]
        : [];
    }),
  ];
}
