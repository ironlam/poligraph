import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/db";
import { computeProbityCandidateCountLive } from "@/services/sync/compute-presidential-snapshots";
import { ProbityCandidateCountSchema, probityCandidateCountKey } from "@/types/stats-snapshots";
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
  //
  // `synced`, like every other boundary: the effective ISR revalidate of a route is the MIN of its
  // own and of every boundary it reads, so `minutes` here re-blocked /statistiques at 60 s. The
  // judicial aggregation below is the expensive one, an EXISTS over the 1.2M-row Candidacy table,
  // and it was paying that toll every minute. Freshness comes from the tags above, not the timer.
  cacheLife("synced");

  const [field, context, probityCandidateCount] = await Promise.all([
    getHubCandidacyField(electionSlug),
    getHubMeasureContext(electionSlug),
    readProbityCandidateCount(electionSlug),
  ]);

  if (context === null) return null;

  return {
    trackedCandidacyCount: field.length,
    documentedCandidacyCount: field.filter((candidacy) => candidacy.measureCount > 0).length,
    verifiedMeasureCount: context.verifiedMeasureCount,
    comparableThemeCount: context.publishableSubjectPageCount,
    probityCandidateCount,
  };
}

/**
 * The probity count comes from the daily snapshot. Its live form is an EXISTS over the 1.2M-row
 * Candidacy table, sub-millisecond warm but several seconds on a cold buffer cache, which is what
 * Sentry flagged as POLIGRAPH-1H on this page.
 *
 * A missing or malformed row falls back to computing it, so the number is never silently wrong:
 * the snapshot buys speed, it is not the authority on the value. The trade-off is freshness, the
 * count trails a newly published affair until the next daily run.
 */
const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

async function readProbityCandidateCount(electionSlug: string): Promise<number> {
  const snapshot = await db.statsSnapshot.findUnique({
    where: { key: probityCandidateCountKey(electionSlug) },
  });
  const parsed = ProbityCandidateCountSchema.safeParse(snapshot?.data);
  const age = snapshot ? Date.now() - new Date(snapshot.computedAt).getTime() : Infinity;
  // The daily step is allowFailure, so a broken job leaves the previous row in place. A few failed
  // runs are worth absorbing rather than falling back to the slow query; a month of them is not,
  // because serving a stale conviction count as current is a false claim, not a slow page.
  if (parsed.success && age <= SNAPSHOT_MAX_AGE_MS) return parsed.data.count;
  return computeProbityCandidateCountLive(electionSlug);
}
