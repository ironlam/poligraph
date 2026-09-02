import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { getCategoriesForSuper } from "@/config/labels";
import { getConvictionOnlyWhere } from "@/lib/affairs/public-filters";
import { db } from "@/lib/db";
import { PUBLIC_HUB_CANDIDACY_WHERE } from "@/lib/presidentielle/publication";
import { getHubCandidacyField, getHubMeasureContext } from "./hub";

export type PresidentialOverviewStats = {
  trackedCandidacyCount: number;
  documentedCandidacyCount: number;
  verifiedMeasureCount: number;
  comparableThemeCount: number;
  probityCandidateCount: number;
};

/**
 * Public presidential figures shown on the general statistics page.
 *
 * The judicial number counts people, not cases. It uses the same conviction-only and probity
 * predicates as candidate fiches, so an investigation or a favourable outcome can never enter it.
 */
export async function getPresidentialOverviewStats(
  electionSlug: string
): Promise<PresidentialOverviewStats | null> {
  "use cache";
  cacheTag("statistics", "affairs", "elections");
  // The overview joins several independently cached authorities and a judicial aggregation.
  // Cache the assembled result so every page view does not repeat that expensive cross-domain read.
  cacheLife("minutes");

  const [field, context, probityCandidates] = await Promise.all([
    getHubCandidacyField(electionSlug),
    getHubMeasureContext(electionSlug),
    db.affair.groupBy({
      by: ["politicianId"],
      where: {
        ...getConvictionOnlyWhere(),
        category: { in: getCategoriesForSuper("PROBITE") },
        politician: {
          is: {
            candidacies: {
              some: {
                election: { slug: electionSlug },
                ...PUBLIC_HUB_CANDIDACY_WHERE,
              },
            },
          },
        },
      },
    }),
  ]);

  if (context === null) return null;

  return {
    trackedCandidacyCount: field.length,
    documentedCandidacyCount: field.filter((candidacy) => candidacy.measureCount > 0).length,
    verifiedMeasureCount: context.verifiedMeasureCount,
    comparableThemeCount: context.publishableSubjectPageCount,
    probityCandidateCount: probityCandidates.length,
  };
}
